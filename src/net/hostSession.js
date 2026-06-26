import { createHost, makeRoomCode } from './peer.js'
import { MSG, PROTOCOL_VERSION, encodeBytes, encodeVoxels } from './protocol.js'
import { raycastVoxel } from '../player/raycast.js'
import { executeChatCommand } from '../mods/commandBus.js'
import { emitModEvent, emitModPacket } from '../mods/eventBus.js'
import { PacketSendEvent } from '../mods/events/PacketSendEvent.js'
import { PacketReceiveEvent } from '../mods/events/PacketReceiveEvent.js'
import { getThing } from '../items/itemRegistry.js'

const ATTACK_REACH = 4.2
const ATTACK_DOT = 0.88
const ATTACK_DAMAGE = 3
const MAX_INVENTORY_SLOTS = 64            // generous ceiling; real inventories are 36-54
const MAX_STACK_HARD_CAP = 9999           // absolute sanity ceiling regardless of item type
const INPUT_RATE_LIMIT_MS = 40            // ~25/sec ceiling on INPUT packets per client
const INVENTORY_GROWTH_RATE_LIMIT_MS = 250 // throttle how often a client's claimed total may jump up

// --- Anti-tamper: validate a client-reported inventory snapshot --------
// The client sends its full inventory every tick purely for cosmetic use
// today (rendering armor on other players, restoring on reconnect). We
// never trust it as a grant of items: anything that doesn't correspond
// to a real, known item/block id, or that exceeds sane stack sizes, is
// stripped out here so it can never leak into snapshots or saved state
// just because a player edited it locally (monkey-patch or otherwise).
function sanitizeClientInventory(raw) {
  if (!Array.isArray(raw)) return null
  const out = []
  for (let i = 0; i < raw.length && i < MAX_INVENTORY_SLOTS; i++) {
    const slot = raw[i]
    if (!slot || typeof slot !== 'object') {
      out.push(null)
      continue
    }
    const id = Number(slot.id)
    let count = Math.floor(Number(slot.count))
    if (!Number.isFinite(id) || !Number.isFinite(count) || count <= 0) {
      out.push(null)
      continue
    }
    const def = getThing(id)
    if (!def) {
      // Unknown item id -- not something the registry could ever have
      // granted legitimately. Drop it rather than let an invented id
      // propagate to other clients or into saved state.
      out.push(null)
      continue
    }
    const max = Math.min(def.stackSize || 64, MAX_STACK_HARD_CAP)
    if (count > max) count = max
    out.push({ id, count })
  }
  return out
}

// Sum of (count) across all slots -- a cheap "did this inventory just
// get a lot richer" signal used for the growth rate limit below.
function inventoryTotal(slots) {
  if (!Array.isArray(slots)) return 0
  let total = 0
  for (const s of slots) {
    if (s && Number.isFinite(s.count)) total += s.count
  }
  return total
}

function forwardOf(player) {
  const yaw = player?.yaw || 0
  const pitch = player?.pitch || 0
  const cp = Math.cos(pitch)
  return {
    x: -Math.sin(yaw) * cp,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * cp
  }
}

export class HostSession {
  constructor(context, options = {}) {
    this.context = context
    this.roomCode = options.roomCode || makeRoomCode()
    this.lockRoomCode = options.lockRoomCode === true
    this.clients = new Map()
    this.savedPlayers = new Map()
    this.nextClientId = 1
    this.retryCount = 0
    this.onStatus = options.onStatus || null
    this.chestViewers = new Map()
    this.handlers = this.createHandlers()
    this._createPeer()
  }

  _createPeer() {
    this.session = createHost(this.roomCode, {
      onReady: () => this._status('ready', this.roomCode),
      onConnection: (conn) => this._accept(conn),
      onError: (err) => this._handleError(err)
    })
  }

  _handleError(err) {
    if (!this.lockRoomCode && err?.type === 'unavailable-id' && this.retryCount < 5) {
      this.retryCount++
      try { this.session?.destroy() } catch (e) {}
      this.roomCode = makeRoomCode()
      this._status('retry', this.roomCode)
      this._createPeer()
      return
    }
    this._status('error', err)
  }

  _status(type, value) {
    if (this.onStatus) this.onStatus(type, value)
  }

  _accept(conn) {
    const id = 'pending_' + this.nextClientId++
    const client = {
      id,
      conn,
      key: id,
      name: 'Player ' + (this.nextClientId - 1),
      state: null,
      _lastInputAt: 0,
      _lastInventoryTotal: 0,
      _lastInventoryGrowthAt: 0,
      _flagCount: 0
    }
    const origSend = conn.send.bind(conn)
    conn.send = (msg) => {
      const packet = msg && typeof msg === 'object' ? msg : { t: msg }
      const ev = emitModEvent(new PacketSendEvent({ packet, side: 'host', clientId: client.id }), this.commandContext(client))
      if (ev.cancelled) return false
      return origSend(packet)
    }
    this.clients.set(id, client)
    conn.onMessage = (msg) => this._message(client, msg)
    conn.onClose = () => {
      this.saveClientState(client)
      this.clients.delete(id)
      this.clients.delete(client.id)
      this.broadcast({ t: MSG.PEER_LEFT, id: client.id })
    }
  }

  _message(client, msg) {
    if (!msg || typeof msg !== 'object') return
    const ev = emitModEvent(new PacketReceiveEvent({ packet: msg, side: 'host', clientId: client?.id || null }), this.commandContext(client))
    if (ev.cancelled) return
    const handler = this.handlers[msg.t]
    if (handler) handler(client, msg)
  }

  createHandlers() {
    return {
      [MSG.HELLO]: (client, msg) => {
        this.clients.delete(client.id)
        client.key = msg.clientId || client.key
        client.id = client.key
        client.name = msg.name || client.name
        this.clients.set(client.id, client)
        const saved = this.savedPlayers.get(client.key)
        const weatherState = this.context.getWeatherState?.() || {
          weather: this.context.activeWorldMeta?.weather || this.context.world?.weather || 'clear',
          weatherTimer: this.context.activeWorldMeta?.weatherTimer ?? this.context.world?.weatherTimer ?? 0
        }
        client.conn.send({
          t: MSG.WELCOME,
          version: PROTOCOL_VERSION,
          id: client.id,
          seed: this.context.activeWorldMeta?.seed,
          gameMode: this.context.activeWorldMeta?.gameMode,
          mods: this.context.activeWorldMeta?.mods || [],
          timeOfDay: this.context.getTimeOfDay?.() ?? this.context.world?.timeOfDay ?? 0,
          weather: weatherState.weather,
          weatherTimer: weatherState.weatherTimer,
          difficulty: this.context.activeWorldMeta?.difficulty || this.context.world?.difficulty || 'normal',
          dimension: this.context.activeWorldMeta?.dimension || this.context.world?.dimension || 'overworld',
          spawn: this.spawnPoint(),
          playerState: saved || null,
          playerKey: client.id
        })
      },
      [MSG.INPUT]: (client, msg) => {
        this.handleInput(client, msg)
      },
      [MSG.BREAK_BLOCK]: (_client, msg) => this.breakBlock(msg.x, msg.y, msg.z),
      [MSG.BREAK_RAY]: (_client, msg) => this.breakRay(msg.eye, msg.dir),
      [MSG.PLACE]: (_client, msg) => this.placeBlock(msg.x, msg.y, msg.z, msg.id),
      [MSG.TOSS]: (_client, msg) => this.tossItem(msg),
      [MSG.CHAT]: (client, msg) => {
        const text = String(msg.text || '').slice(0, 180)
        this.broadcast({ t: MSG.CHAT, name: client.name || 'Player', text })
        this.context.chatUI?.addMessage(client.name || 'Player', text)
      },
      [MSG.COMMAND]: (client, msg) => this.handleCommand(msg.text, client),
      [MSG.ATTACK_PLAYER]: (client, msg) => this.attackPlayer(client.id, msg.player || client.state?.player),
      [MSG.ATTACK_MOB]: (client, msg) => this.attackMob(msg.player || client.state?.player),
      [MSG.CHEST_OPEN]: (client, msg) => {
        const key = `${msg.x},${msg.y},${msg.z}`
        if (!this.chestViewers.has(key)) this.chestViewers.set(key, new Set())
        this.chestViewers.get(key).add(client.id)
        const inv = this.context.world?.getChestInventory(msg.x, msg.y, msg.z)
        if (!inv) return
        inv.isOpen = true
        this.broadcast({ t: MSG.CHEST_OPEN, x: msg.x, y: msg.y, z: msg.z })
        client.conn.send({
          t: MSG.CHEST_UPDATE,
          x: msg.x,
          y: msg.y,
          z: msg.z,
          slots: inv.serialize()
        })
      },
      [MSG.CHEST_CLOSE]: (client, msg) => {
        const key = `${msg.x},${msg.y},${msg.z}`
        if (!this.chestViewers.has(key)) return
        this.chestViewers.get(key).delete(client.id)
        if (this.chestViewers.get(key).size !== 0) return
        this.chestViewers.delete(key)
        let hostViewing = false
        if (globalThis.__currentChestLocation) {
          const [cx, cy, cz] = globalThis.__currentChestLocation
          hostViewing = cx === msg.x && cy === msg.y && cz === msg.z
        }
        if (hostViewing) return
        const inv = this.context.world?.getChestInventory(msg.x, msg.y, msg.z)
        if (inv) {
          inv.isOpen = false
          this.broadcast({ t: MSG.CHEST_CLOSE, x: msg.x, y: msg.y, z: msg.z })
        }
      },
      [MSG.CHEST_FACING]: (_client, msg) => {
        const inv = this.context.world?.getChestInventory(msg.x, msg.y, msg.z)
        if (!inv) return
        inv.facing = msg.facing
        this.broadcast({ t: MSG.CHEST_FACING, x: msg.x, y: msg.y, z: msg.z, facing: msg.facing })
        if (globalThis.blockModels) globalThis.blockModels.sync(msg.x, msg.y, msg.z)
      },
      [MSG.CHEST_UPDATE]: (client, msg) => {
        const key = `${msg.x},${msg.y},${msg.z}`
        const inv = this.context.world?.getChestInventory(msg.x, msg.y, msg.z)
        if (inv) {
          inv.slots[msg.index] = msg.slot || null
          inv.emit()
        }
        const viewers = this.chestViewers.get(key)
        if (!viewers) return
        for (const viewerId of viewers) {
          if (viewerId === client.id) continue
          const viewer = this.clients.get(viewerId)
          if (!viewer?.conn) continue
          viewer.conn.send({
            t: MSG.CHEST_UPDATE,
            x: msg.x,
            y: msg.y,
            z: msg.z,
            index: msg.index,
            slot: msg.slot
          })
        }
      },
      [MSG.CHUNK_REQUEST]: (client, msg) => this._sendChunk(client.conn, msg.cx, msg.cz),
      [MSG.CHUNK_VISIBILITY]: (client, msg) => {
        const chunks = Array.isArray(msg.chunks) ? msg.chunks : []
        for (const c of chunks) {
          if (!c) continue
          this._sendChunk(client.conn, c.cx, c.cz)
        }
      },
      [MSG.MOD_PACKET]: (client, msg) => {
        emitModPacket(msg.packetType || msg.type, msg.payload || {}, this.commandContext(client))
      },
      [MSG.GAMEMODE_REQUEST]: (client, msg) => this.handleGamemodeRequest(client, msg)
    }
  }

  // Clients never set their own gamemode locally and have it count for
  // anything authoritative -- they ask, the host decides, and the host
  // pushes GAMEMODE_SET back (to the requester only, today's allowed
  // modes are self-serve; tighten this check if you add an op-only mode).
  handleGamemodeRequest(client, msg) {
    const mode = msg && msg.mode
    if (mode !== 'survival' && mode !== 'creative' && mode !== 'spectator') return
    client.gamemode = mode
    client.conn.send({ t: MSG.GAMEMODE_SET, mode })
  }

  // Validate and rate-limit a client's reported input/state. This is
  // the chokepoint that stops a tampered local inventory (whether from
  // monkey-patching addItem or just hand-editing the object/slots in
  // DevTools) from being trusted as real game state. Anything that
  // doesn't pass sanitizeClientInventory() is silently dropped, never
  // echoed back to other clients and never written into savedPlayers.
  handleInput(client, msg) {
    const now = Date.now()
    if (now - client._lastInputAt < INPUT_RATE_LIMIT_MS) return
    client._lastInputAt = now

    const state = msg && typeof msg === 'object' ? msg.state : null
    if (!state || typeof state !== 'object') {
      client.state = null
      return
    }

    const cleanInventory = sanitizeClientInventory(state.inventory)
    // Default to whatever we last accepted; only replace it below if
    // this tick's claim passes both sanitization and the growth check.
    let acceptedInventory = client.state?.inventory ?? null

    if (state.inventory != null && cleanInventory == null) {
      // Malformed payload entirely (not even an array) - ignore this
      // tick's inventory claim rather than accept garbage.
      client._flagCount++
    } else if (cleanInventory) {
      const total = inventoryTotal(cleanInventory)
      if (total > client._lastInventoryTotal && now - client._lastInventoryGrowthAt < INVENTORY_GROWTH_RATE_LIMIT_MS) {
        // Inventory total is climbing faster than legitimate pickups or
        // crafting could plausibly produce. Reject this tick's claim
        // outright and keep using the last trusted inventory instead.
        client._flagCount++
      } else {
        if (total > client._lastInventoryTotal) client._lastInventoryGrowthAt = now
        client._lastInventoryTotal = total
        acceptedInventory = cleanInventory
      }
    }

    client.state = {
      player: state.player || null,
      input: state.input || null,
      inventory: acceptedInventory,
      health: state.health || null
    }
    this.saveClientState(client)
  }

  saveClientState(client) {
    if (!client?.key || !client.state) return
    this.savedPlayers.set(client.key, {
      player: client.state.player || null,
      inventory: client.state.inventory || null,
      health: client.state.health || null,
      enderChests: client.state.enderChests || null
    })
  }

  handleCommand(text, client) {
    const result = executeChatCommand(text, this.commandContext(client))
    if (result) {
      if (result.ok) {
        this.broadcast({ t: MSG.CHAT, name: 'Server', text: result.message })
      } else {
        client.conn.send({ t: MSG.CHAT, name: 'Error', text: result.message })
      }
    }
  }

  commandContext(client) {
    return {
      isOp: client ? !!client.isOp : true, // Host has isOp = true when executing locally (client will be null/undefined)
      playerName: client?.name || 'Player1',
      getPlayers: () => {
        const list = Array.from(this.clients.values()).map((c) => ({ id: c.id, name: c.name, player: c.state?.player }))
        list.push({ id: 'host', name: 'Player1', player: this.context.player, health: this.context.health })
        return list
      },
      damageTargets: (names, amount) => this.damageTargets(names, amount),
      setGamemode: (mode) => {
        if (this.context.world) {
          globalThis.dispatchEvent?.(new CustomEvent('set_gamemode', { detail: mode }))
        }
      },
      setTimeOfDay: (ticks) => {
        if (typeof this.context.setTimeOfDay === 'function') {
          return this.context.setTimeOfDay(ticks)
        }
        return false
      },
      world: this.context.world,
      player: client ? client.state?.player : this.context.player,
      inventory: this.context.inventory,
      mobManager: this.context.mobManager,
      villageGen: this.context.villageGen,
      teleportTargets: (names, x, y, z) => {
        if (names.includes('Player1') || names.includes('@a') || (client === undefined && names.includes('@s'))) {
          if (this.context.player) {
            this.context.player.position.set(x, y, z)
            this.context.player.velocity?.set(0, 0, 0)
          }
        }
        for (const c of this.clients.values()) {
          if (names.includes(c.name) || names.includes('@a') || (client && client.id === c.id && names.includes('@s'))) {
            c.conn.send({ t: MSG.TELEPORT, x, y, z })
          }
        }
      },
      opPlayer: (name) => {
        const found = Array.from(this.clients.values()).find(
          (c) => String(c.name || '').toLowerCase() === String(name).toLowerCase()
        )
        if (found) {
          found.isOp = true
          return true
        }
        return false
      },
      deopPlayer: (name) => {
        const found = Array.from(this.clients.values()).find(
          (c) => String(c.name || '').toLowerCase() === String(name).toLowerCase()
        )
        if (found) {
          found.isOp = false
          return true
        }
        return false
      },
      giveTargetItem: (name, itemId, count = 1) => this.giveTargetItem(name, itemId, count),
      setWeather: (value) => {
        if (typeof this.context.setWeather === 'function') return this.context.setWeather(value)
        if (this.context.world) {
          this.context.world.weather = value
          return true
        }
        return false
      },
      setDifficulty: (value) => {
        if (typeof this.context.setDifficulty === 'function') return this.context.setDifficulty(value)
        if (this.context.world) {
          this.context.world.difficulty = value
          return true
        }
        return false
      },
      syncBlock: (x, y, z, id) => {
        if (globalThis.blockModels) globalThis.blockModels.sync(x, y, z)
      },
      getStats: () => this.context.getStats?.() || null,
      sendPacket: (type, payload) => {
        emitModPacket(type, payload, this.commandContext(client))
      },
      capabilities: this.context.capabilities || {}
    }
  }

  giveTargetItem(name, itemId, count = 1) {
    const targetName = String(name || '')
    const target = Array.from(this.clients.values()).find(
      (c) => String(c.name || '').toLowerCase() === targetName.toLowerCase()
    )
    if (target) {
      const inv = Array.isArray(target.state?.inventory) ? [...target.state.inventory] : []
      while (inv.length < 41) inv.push(null)
      let remaining = Math.max(1, Math.floor(Number(count) || 1))
      for (let i = 0; i < inv.length && remaining > 0; i++) {
        const slot = inv[i]
        if (slot && slot.id === itemId && slot.count < 64) {
          const add = Math.min(64 - slot.count, remaining)
          slot.count += add
          remaining -= add
        }
      }
      for (let i = 0; i < inv.length && remaining > 0; i++) {
        if (!inv[i]) {
          const add = Math.min(64, remaining)
          inv[i] = { id: itemId, count: add }
          remaining -= add
        }
      }
      target.state = target.state || {}
      target.state.inventory = inv
      target.conn.send({ t: MSG.INVENTORY_SET, inventory: inv })
      return true
    }
    if (targetName.toLowerCase() === 'player1' || targetName.toLowerCase() === 'host' || targetName === '@s') {
      if (this.context.inventory?.addItem) {
        this.context.inventory.addItem(itemId, count)
        return true
      }
    }
    return false
  }

  damageTargets(names, amount) {
    const targetSet = new Set(names)
    if (targetSet.has('Player1') || targetSet.has('Host')) this.context.health?.damage(amount)
    for (const client of this.clients.values()) {
      if (!targetSet.has(client.name)) continue
      client.conn.send({ t: MSG.HEALTH_SET, id: client.id, damage: amount })
    }
  }

  spawnPoint() {
    const p = this.context.player
    if (!p) return { x: 0.5, y: 80, z: 0.5, yaw: 0, pitch: 0 }
    return {
      x: p.position.x + 1.5,
      y: p.position.y,
      z: p.position.z + 1.5,
      yaw: p.yaw,
      pitch: 0
    }
  }

  breakBlock(x, y, z) {
    this.context.world?.setBlock(x, y, z, 0)
    this.broadcast({ t: MSG.BLOCK_UPDATE, x, y, z, id: 0 })
  }

  breakRay(eye, dir) {
    if (!this.context.world || !eye || !dir) return false
    const hit = raycastVoxel(this.context.world, eye, dir)
    if (!hit) return false
    this.breakBlock(hit.block.x, hit.block.y, hit.block.z)
    return true
  }

  placeBlock(x, y, z, id) {
    this.context.world?.setBlock(x, y, z, id)
    this.broadcast({ t: MSG.BLOCK_UPDATE, x, y, z, id })
  }

  tossItem(msg) {
    if (!this.context.dropManager || !msg || !msg.id || !msg.count) return false
    const drop = this.context.dropManager.spawn(msg.x, msg.y, msg.z, msg.id, msg.count)
    if (!drop) return false
    if (drop.velocity && msg.velocity) {
      drop.velocity.set(msg.velocity.x || 0, msg.velocity.y || 0, msg.velocity.z || 0)
    }
    drop.pickupDelay = 0.8
    return true
  }

  attackPlayer(attackerId, attacker) {
    if (!attacker) return false
    const origin = { x: attacker.x, y: (attacker.y || 0) + 1.5, z: attacker.z }
    const forward = forwardOf(attacker)
    let best = null
    for (const target of this.playerSnapshots()) {
      if (!target || target.id === attackerId) continue
      const tx = target.x - origin.x
      const ty = ((target.y || 0) + 1.0) - origin.y
      const tz = target.z - origin.z
      const dist = Math.hypot(tx, ty, tz)
      if (dist <= 0.001 || dist > ATTACK_REACH) continue
      const dot = (tx / dist) * forward.x + (ty / dist) * forward.y + (tz / dist) * forward.z
      if (dot < ATTACK_DOT) continue
      if (!best || dist < best.dist) best = { target, dist }
    }
    if (!best) return false
    if (best.target.id === 'host') {
      this.context.health?.damage(ATTACK_DAMAGE)
      const p = this.context.player
      if (p?.velocity) {
        const dx = p.position.x - origin.x
        const dz = p.position.z - origin.z
        const len = Math.hypot(dx, dz) || 1
        p.velocity.x += (dx / len) * 2.6
        p.velocity.z += (dz / len) * 2.6
        p.velocity.y = Math.max(p.velocity.y, 1.8)
      }
    } else {
      const client = this.clients.get(best.target.id)
      const dx = best.target.x - origin.x
      const dz = best.target.z - origin.z
      const len = Math.hypot(dx, dz) || 1
      client?.conn.send({
        t: MSG.HEALTH_SET,
        id: best.target.id,
        damage: ATTACK_DAMAGE,
        knockback: { x: (dx / len) * 2.6, y: 1.8, z: (dz / len) * 2.6 }
      })
    }
    return true
  }

  attackMob(attacker) {
    if (!attacker || !this.context.mobManager) return false
    const origin = { x: attacker.x, y: (attacker.y || 0) + 1.5, z: attacker.z }
    const forward = forwardOf(attacker)
    let best = null
    for (const mob of this.context.mobManager.mobs) {
      if (!mob || mob.dead || mob.dying) continue
      const tx = mob.position.x - origin.x
      const ty = (mob.position.y + (mob.height || 1) * 0.5) - origin.y
      const tz = mob.position.z - origin.z
      const dist = Math.hypot(tx, ty, tz)
      if (dist <= 0.001 || dist > ATTACK_REACH) continue
      const dot = (tx / dist) * forward.x + (ty / dist) * forward.y + (tz / dist) * forward.z
      if (dot < ATTACK_DOT) continue
      if (!best || dist < best.dist) best = { mob, dist }
    }
    if (!best) return false
    best.mob.damage(ATTACK_DAMAGE, origin.x, origin.z)
    return true
  }

  _sendChunk(conn, cx, cz) {
    const data = this.context.world?.serializeChunkData(cx, cz)
    if (!data) return
    conn.send({ t: MSG.CHUNK_DATA, cx, cz, voxels: encodeVoxels(data.voxels), levels: encodeBytes(data.levels) })
  }

  playerSnapshots() {
    const local = this.context.player
    const players = []
    if (local) {
      const localInv = this.context.inventory
      const localGamemode = local.gamemode
      players.push({
        id: 'host',
        name: 'Host',
        x: local.position.x,
        y: local.position.y,
        z: local.position.z,
        yaw: local.yaw,
        pitch: local.pitch,
        armor: localInv ? [localInv.slots[36], localInv.slots[37], localInv.slots[38], localInv.slots[39]] : [null, null, null, null],
        spectator: localGamemode ? !localGamemode.isVisible() : false
      })
    }
    for (const client of this.clients.values()) {
      if (client.state?.player) {
        const cInv = client.state.inventory || []
        players.push({
          id: client.id,
          name: client.name,
          ...client.state.player,
          armor: [cInv[36], cInv[37], cInv[38], cInv[39]]
        })
      }
    }
    return players
  }

  update() {
    const weatherState = this.context.getWeatherState?.() || {
      weather: this.context.activeWorldMeta?.weather || this.context.world?.weather || 'clear',
      weatherTimer: this.context.activeWorldMeta?.weatherTimer ?? this.context.world?.weatherTimer ?? 0
    }
    this.broadcast({
      t: MSG.SNAPSHOT,
      timeOfDay: this.context.getTimeOfDay(),
      weather: weatherState.weather,
      weatherTimer: weatherState.weatherTimer,
      difficulty: this.context.activeWorldMeta?.difficulty || this.context.world?.difficulty || 'normal',
      dimension: this.context.activeWorldMeta?.dimension || this.context.world?.dimension || 'overworld',
      players: this.playerSnapshots(),
      mobs: this.context.mobManager?.serialize() || [],
      drops: this.context.dropManager?.serialize() || []
    })
  }

  broadcast(msg) {
    for (const client of this.clients.values()) client.conn.send(msg)
  }

  destroy() {
    if (this.session) this.session.destroy()
    this.clients.clear()
  }
}
