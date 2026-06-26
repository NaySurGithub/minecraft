import { connectClient } from './peer.js'
import { MSG, decodeBytes, decodeVoxels } from './protocol.js'
import { CHUNK_SIZE } from '../config/constants.js'
import { emitModEvent, emitModPacket } from '../mods/eventBus.js'
import { PacketSendEvent } from '../mods/events/PacketSendEvent.js'
import { PacketReceiveEvent } from '../mods/events/PacketReceiveEvent.js'

const CLIENT_ID_KEY = 'nazzaandnaycraft_multiplayer_client_id'

function getClientId() {
  let id = localStorage.getItem(CLIENT_ID_KEY)
  if (!id) {
    id = 'client_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem(CLIENT_ID_KEY, id)
  }
  return id
}

function getDefaultClientName(clientId) {
  const n = parseInt(String(clientId).replace(/\D+/g, '').slice(-2), 10)
  if (Number.isFinite(n) && n > 0) return 'Player ' + (((n - 1) % 100) + 1)
  return 'Player'
}

export class ClientSession {
  constructor(context, roomCode, options = {}) {
    this.context = context
    this.roomCode = roomCode
    this.id = null
    this.connection = null
    this.clientId = getClientId()
    this.requestedChunks = new Set()
    this.receivedChunks = new Set()
    this.chunkWaiters = []
    this.chunkRequestTimer = 0
    this.onStatus = options.onStatus || null
    this.connectionFailed = false
    this.disconnected = false
    this.welcome = new Promise((resolve) => { this._resolveWelcome = resolve })
    this.handlers = this.createHandlers()
    this.session = connectClient(roomCode, {
      onConnected: (conn) => {
        this.connection = conn
        const origSend = conn.send.bind(conn)
        conn.send = (msg) => {
          const packet = msg && typeof msg === 'object' ? msg : { t: msg }
          const ev = emitModEvent(new PacketSendEvent({ packet, side: 'client' }), { ...this.context, onPacket: this.context.onPacket })
          if (ev.cancelled) return false
          return origSend(packet)
        }
        conn.onMessage = (msg) => this._message(msg)
        conn.onClose = () => {
          this._handleDisconnect()
        }
        conn.send({ t: MSG.HELLO, clientId: this.clientId, name: options.name || getDefaultClientName(this.clientId) })
        this._status('connected', roomCode)
      },
      onError: (err) => {
        this.connectionFailed = true
        this._status('error', err)
      }
    })
  }

  _status(type, value) {
    if (this.onStatus) this.onStatus(type, value)
  }

  _message(msg) {
    if (!msg || typeof msg !== 'object') return
    const ev = emitModEvent(new PacketReceiveEvent({ packet: msg, side: 'client' }), { ...this.context, onPacket: this.context.onPacket })
    if (ev.cancelled) return
    const handler = this.handlers[msg.t]
    if (handler) handler(msg)
  }

  createHandlers() {
    return {
      [MSG.WELCOME]: (msg) => {
        this.id = msg.id
        this.context.applyMods?.(msg.mods || [])
        this.context.applyWelcomeState?.(msg.playerState || { player: msg.spawn, playerKey: msg.playerKey })
        this.context.applyRemoteSnapshot?.(msg, this.id)
        if (this.context.player) this.requestNearbyChunks(this.context.player)
        if (this._resolveWelcome) this._resolveWelcome(msg)
        this._status('welcome', msg)
      },
      [MSG.CHUNK_DATA]: (msg) => {
        this.context.world?.applyChunkData(msg.cx, msg.cz, decodeVoxels(msg.voxels), msg.levels ? decodeBytes(msg.levels) : null)
        const key = this.chunkKey(msg.cx, msg.cz)
        this.receivedChunks.add(key)
        this.flushChunkWaiters()
      },
      [MSG.BLOCK_UPDATE]: (msg) => {
        this.context.world?.setBlockSilent(msg.x, msg.y, msg.z, msg.id)
        if (globalThis.blockModels) globalThis.blockModels.sync(msg.x, msg.y, msg.z)
      },
      [MSG.BLOCK_UPDATES]: (msg) => {
        const updates = Array.isArray(msg.updates) ? msg.updates : []
        for (const update of updates) {
          if (!update) continue
          this.context.world?.setBlockSilent(update.x, update.y, update.z, update.id)
          if (globalThis.blockModels) globalThis.blockModels.sync(update.x, update.y, update.z)
        }
      },
      [MSG.INVENTORY_SET]: (msg) => {
        if (this.context.inventory && Array.isArray(msg.inventory)) this.context.inventory.load(msg.inventory)
      },
      [MSG.CHEST_OPEN]: (msg) => {
        const inv = this.context.world?.getChestInventory(msg.x, msg.y, msg.z)
        if (inv) inv.isOpen = true
      },
      [MSG.CHEST_CLOSE]: (msg) => {
        const inv = this.context.world?.getChestInventory(msg.x, msg.y, msg.z)
        if (inv) inv.isOpen = false
      },
      [MSG.CHEST_FACING]: (msg) => {
        const inv = this.context.world?.getChestInventory(msg.x, msg.y, msg.z)
        if (inv) {
          inv.facing = msg.facing
          if (globalThis.blockModels) globalThis.blockModels.sync(msg.x, msg.y, msg.z)
        }
      },
      [MSG.CHEST_UPDATE]: (msg) => {
        if (!globalThis.__currentChestLocation) return
        const [cx, cy, cz] = globalThis.__currentChestLocation
        if (cx !== msg.x || cy !== msg.y || cz !== msg.z) return
        const inv = this.context.world?.getChestInventory(msg.x, msg.y, msg.z)
        if (!inv) return
        if (msg.index != null) {
          inv.slots[msg.index] = msg.slot || null
          inv.emit()
        } else if (msg.slots) {
          inv.load(msg.slots)
          if (globalThis.__openChestUI) globalThis.__openChestUI(inv)
        }
      },
      [MSG.TELEPORT]: (msg) => {
        if (!this.context.player) return
        this.context.player.position.set(msg.x, msg.y, msg.z)
        this.context.player.velocity?.set(0, 0, 0)
      },
      [MSG.SNAPSHOT]: (msg) => this.context.applyRemoteSnapshot?.(msg, this.id),
      [MSG.MOD_PACKET]: (msg) => {
        emitModPacket(msg.packetType || msg.type, msg.payload || {}, {
          ...this.context,
          onPacket: this.context.onPacket
        })
      },
      [MSG.HEALTH_SET]: (msg) => {
        if (msg.id && msg.id !== this.id) return
        if (msg.health) this.context.health?.load(msg.health)
        else if (msg.damage) this.context.health?.damage(msg.damage)
        if (msg.knockback && this.context.player?.velocity) {
          this.context.player.velocity.x += msg.knockback.x || 0
          this.context.player.velocity.y = Math.max(this.context.player.velocity.y, msg.knockback.y || 0)
          this.context.player.velocity.z += msg.knockback.z || 0
        }
      },
      [MSG.CHAT]: (msg) => this.context.chatUI?.addMessage(msg.name || 'Player', msg.text || '')
    }
  }

  requestChunk(cx, cz) {
    this.connection?.send({ t: MSG.CHUNK_REQUEST, cx, cz })
  }

  requestChunkVisibility(chunks) {
    if (!chunks.length) return
    this.connection?.send({ t: MSG.CHUNK_VISIBILITY, chunks })
  }

  chunkKey(cx, cz) {
    return cx + ',' + cz
  }

  breakBlock(x, y, z) {
    this.connection?.send({ t: MSG.BREAK_BLOCK, x, y, z })
  }

  breakRay(player) {
    if (!player) return
    const eye = player.getEye()
    const dir = player.getForward()
    this.connection?.send({
      t: MSG.BREAK_RAY,
      eye: { x: eye.x, y: eye.y, z: eye.z },
      dir: { x: dir.x, y: dir.y, z: dir.z }
    })
  }

  placeBlock(x, y, z, id) {
    this.connection?.send({ t: MSG.PLACE, x, y, z, id })
  }

  tossItem(payload) {
    this.connection?.send({ t: MSG.TOSS, ...payload })
  }

  sendChat(text) {
    const cleaned = String(text || '').trim()
    if (!cleaned) return
    this.connection?.send({ t: MSG.CHAT, text: cleaned.slice(0, 180) })
  }

  sendCommand(text) {
    const cleaned = String(text || '').trim()
    if (!cleaned) return
    this.connection?.send({ t: MSG.COMMAND, text: cleaned.slice(0, 180) })
  }

  attackPlayer(player) {
    if (!player) return
    this.connection?.send({
      t: MSG.ATTACK_PLAYER,
      player: {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
        yaw: player.yaw,
        pitch: player.pitch
      }
    })
  }

  attackMob(player) {
    if (!player) return
    this.connection?.send({
      t: MSG.ATTACK_MOB,
      player: {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
        yaw: player.yaw,
        pitch: player.pitch
      }
    })
  }
  openChest(x, y, z) {
    this.connection?.send({ t: MSG.CHEST_OPEN, x, y, z })
  }

  closeChest(x, y, z) {
    this.connection?.send({ t: MSG.CHEST_CLOSE, x, y, z })
  }

  updateChestSlot(x, y, z, index, slot) {
    this.connection?.send({ t: MSG.CHEST_UPDATE, x, y, z, index, slot })
  }

  updateChestFacing(x, y, z, facing) {
    this.connection?.send({ t: MSG.CHEST_FACING, x, y, z, facing })
  }

  sendModPacket(type, payload = {}) {
    this.connection?.send({ t: MSG.MOD_PACKET, packetType: type, payload })
  }

  update(dt = 0) {
    const player = this.context.player
    if (!player || !this.connection) return
    this.chunkRequestTimer += dt
    if (this.chunkRequestTimer >= 0.25) {
      this.chunkRequestTimer = 0
      this.requestNearbyChunks(player)
    }
    this.connection.send({
      t: MSG.INPUT,
      state: {
        player: {
          x: player.position.x,
          y: player.position.y,
          z: player.position.z,
          yaw: player.yaw,
          pitch: player.pitch
        },
        input: this.context.input?.state || {},
        inventory: this.context.inventory?.serialize() || null,
        health: this.context.health?.serialize() || null
      }
    })
  }

  requestNearbyChunks(player) {
    const world = this.context.world
    if (!world) return
    const pcx = Math.floor(player.position.x / CHUNK_SIZE)
    const pcz = Math.floor(player.position.z / CHUNK_SIZE)
    const rd = Math.min((world.renderDistance || 4) + 1, 8)
    const visible = []
    for (let dz = -rd; dz <= rd; dz++) {
      for (let dx = -rd; dx <= rd; dx++) {
        if (dx * dx + dz * dz > rd * rd) continue
        const cx = pcx + dx
        const cz = pcz + dz
        const key = this.chunkKey(cx, cz)
        if (this.requestedChunks.has(key)) continue
        this.requestedChunks.add(key)
        visible.push({ cx, cz })
      }
    }
    this.requestChunkVisibility(visible)
  }

  chunkCoordsAround(player, radius) {
    const pcx = Math.floor(player.position.x / CHUNK_SIZE)
    const pcz = Math.floor(player.position.z / CHUNK_SIZE)
    const coords = []
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dz * dz > radius * radius) continue
        coords.push({ cx: pcx + dx, cz: pcz + dz })
      }
    }
    return coords
  }

  waitForChunksAround(player, radius = 1, onProgress = null, timeoutMs = 10000) {
    const coords = this.chunkCoordsAround(player, radius)
    for (const c of coords) {
      const key = this.chunkKey(c.cx, c.cz)
      if (!this.requestedChunks.has(key)) {
        this.requestedChunks.add(key)
        this.requestChunk(c.cx, c.cz)
      }
    }
    return new Promise((resolve) => {
      const waiter = {
        coords,
        onProgress,
        resolved: false,
        resolve: (ok) => {
          if (waiter.resolved) return
          waiter.resolved = true
          clearTimeout(waiter.timeout)
          resolve(ok)
        },
        timeout: null
      }
      waiter.timeout = setTimeout(() => waiter.resolve(false), timeoutMs)
      this.chunkWaiters.push(waiter)
      this.flushChunkWaiters()
    })
  }

  flushChunkWaiters() {
    for (let i = this.chunkWaiters.length - 1; i >= 0; i--) {
      const waiter = this.chunkWaiters[i]
      let done = 0
      for (const c of waiter.coords) {
        if (this.receivedChunks.has(this.chunkKey(c.cx, c.cz))) done++
      }
      if (waiter.onProgress) waiter.onProgress(done, waiter.coords.length)
      if (done >= waiter.coords.length) {
        this.chunkWaiters.splice(i, 1)
        waiter.resolve(true)
      } else if (waiter.retries > 0 && done === 0 && waiter.retries >= 3) {
        this.chunkWaiters.splice(i, 1)
        waiter.resolve(false)
      }
    }
  }

  _handleDisconnect() {
    this.connected = false
    this.disconnected = true
    if (!this.id) this.connectionFailed = true
    if (!this.id) this._resolveWelcome?.(null)
    this.context.onDisconnect?.()
  }

  destroy() {
    if (this.session) this.session.destroy()
  }
}
