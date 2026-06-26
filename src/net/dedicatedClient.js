import { MSG, decodeVoxels, decodeBytes } from '../net/protocol.js'
import { CHUNK_SIZE } from '../config/constants.js'

/**
 * Client session for connecting to a dedicated WebSocket server.
 * Provides the same interface as ClientSession (P2P) so the game code
 * doesn't need to know the difference.
 */
export class DedicatedClientSession {
  constructor(context, address, port = 25565, options = {}) {
    this.context = context
    this.address = address
    this.port = port
    this.ws = null
    this.id = null
    this.connected = false
    this.requestedChunks = new Set()
    this.receivedChunks = new Set()
    this.chunkWaiters = []
    this.chunkRequestTimer = 0
    this.onStatus = options.onStatus || null
    this.welcome = new Promise((resolve) => { this._resolveWelcome = resolve })
    this.handlers = this.createHandlers()
    this.connect()
  }

  connect() {
    const url = `ws://${this.address}:${this.port}`
    
    try {
      this.ws = new WebSocket(url)
    } catch (error) {
      this._status('error', error)
      return
    }

    this.ws.onopen = () => {
      this.connected = true
      this._status('connected', `${this.address}:${this.port}`)
      
      // Send HELLO packet
      const username = localStorage.getItem('nazzaandnaycraft_username') || 'Player'
      const clientId = 'client_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
      this.clientId = clientId
      this.send({ t: MSG.HELLO, clientId: this.clientId, name: username })
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        this._message(msg)
      } catch (e) {
        console.error('Failed to parse server message:', e)
      }
    }

    this.ws.onclose = () => {
      this.connected = false
      this._status('disconnected', null)
      this.context.onDisconnect?.()
    }

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      this._status('error', error)
    }
  }

  _status(type, value) {
    if (this.onStatus) this.onStatus(type, value)
  }

  _message(msg) {
    if (!msg || typeof msg !== 'object') return
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
      [MSG.TELEPORT]: (msg) => {
        if (!this.context.player) return
        this.context.player.position.set(msg.x, msg.y, msg.z)
        this.context.player.velocity?.set(0, 0, 0)
      },
      [MSG.SNAPSHOT]: (msg) => this.context.applyRemoteSnapshot?.(msg, this.id),
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
      [MSG.CHAT]: (msg) => this.context.chatUI?.addMessage(msg.name || 'Server', msg.text || ''),
      [MSG.GAMEMODE_SET]: (msg) => {
        if (this.context.gamemode) this.context.gamemode.set(msg.mode)
      },
      [MSG.PEER_LEFT]: (msg) => {
        // Another player left
        if (this.context.remoteRenderers) {
          this.context.remoteRenderers.removePlayer?.(msg.id)
        }
      }
    }
  }

  send(msg) {
    if (!this.connected || !this.ws) return
    try {
      this.ws.send(JSON.stringify(msg))
    } catch (e) {
      console.error('Send error:', e)
    }
  }

  requestChunk(cx, cz) {
    this.send({ t: MSG.CHUNK_REQUEST, cx, cz })
  }

  requestChunkVisibility(chunks) {
    if (!chunks.length) return
    this.send({ t: MSG.CHUNK_VISIBILITY, chunks })
  }

  chunkKey(cx, cz) {
    return cx + ',' + cz
  }

  breakBlock(x, y, z) {
    this.send({ t: MSG.BREAK_BLOCK, x, y, z })
  }

  breakRay(player) {
    if (!player) return
    const eye = player.getEye()
    const dir = player.getForward()
    this.send({
      t: MSG.BREAK_RAY,
      eye: { x: eye.x, y: eye.y, z: eye.z },
      dir: { x: dir.x, y: dir.y, z: dir.z }
    })
  }

  placeBlock(x, y, z, id) {
    this.send({ t: MSG.PLACE, x, y, z, id })
  }

  tossItem(payload) {
    this.send({ t: MSG.TOSS, ...payload })
  }

  sendChat(text) {
    const cleaned = String(text || '').trim()
    if (!cleaned) return
    this.send({ t: MSG.CHAT, text: cleaned.slice(0, 180) })
  }

  sendCommand(text) {
    const cleaned = String(text || '').trim()
    if (!cleaned) return
    this.send({ t: MSG.COMMAND, text: cleaned.slice(0, 180) })
  }

  attackPlayer(player) {
    if (!player) return
    this.send({
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
    this.send({
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
    this.send({ t: MSG.CHEST_OPEN, x, y, z })
  }

  closeChest(x, y, z) {
    this.send({ t: MSG.CHEST_CLOSE, x, y, z })
  }

  updateChestSlot(x, y, z, index, slot) {
    this.send({ t: MSG.CHEST_UPDATE, x, y, z, index, slot })
  }

  sendModPacket(type, payload = {}) {
    this.send({ t: MSG.MOD_PACKET, packetType: type, payload })
  }

  update(dt = 0) {
    const player = this.context.player
    if (!player || !this.connected) return
    
    this.chunkRequestTimer += dt
    if (this.chunkRequestTimer >= 1) {
      this.chunkRequestTimer = 0
      this.requestNearbyChunks(player)
    }
    
    this.send({
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
    const rd = Math.min(world.renderDistance || 4, 4)
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
        resolve: () => {
          clearTimeout(waiter.timeout)
          resolve()
        },
        timeout: null
      }
      waiter.timeout = setTimeout(waiter.resolve, timeoutMs)
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
        waiter.resolve()
      }
    }
  }

  destroy() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.connected = false
  }
}
