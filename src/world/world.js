import * as THREE from 'three'
import { CHUNK_SIZE, CHUNK_HEIGHT } from '../config/constants.js'
import { AIR, blocks, blocksByName, blockIds } from '../blocks/registry.js'
import { Chunk, chunkKey } from './chunk.js'
import { TerrainGenerator } from './terrain.js'
import { meshChunk } from './mesher.js'
import { computeChunkLightMap, computeChunkSkyMap } from './lightEngine.js'
import { DEBUG_GENERATION, DEBUG_TEXTURES, debugLog } from '../debug/debug.js'
import { Inventory, DoubleChestInventory } from '../inventory/inventory.js'
import { ChestTileEntity, createTileEntityForBlock, createTileEntityFromData, tileEntityKey } from './tileEntities.js'
import { FallingBlockSystem } from './FallingBlockSystem.js'

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

function floorDiv(a, b) {
  return Math.floor(a / b)
}

export class World {
  constructor(scene, seed, atlas, material, transparentMaterial, options = {}) {
    this.scene = scene

    this.fallingBlockSystem = new FallingBlockSystem(
      this,
      scene,
      atlas,
      material
    )
  
    this.seed = seed
    this.atlas = atlas
    this.material = material
    this.transparentMaterial = transparentMaterial
    this.dimension = options.dimension || 'overworld'
    this.terrain = options.terrain || new TerrainGenerator(seed)
    this.chunks = new Map()
    this.renderDistance = 6
    this.remeshQueue = []
    this.tickQueue = []
    this.tickHead = 0
    this.tickKeys = new Set()
    // Active fire/lava positions, keyed "x,y,z". Maintained by setBlock and
    // ensureChunk so updateFireSpread never has to scan whole chunks.
    this.firePositions = new Map()
    this.fireScanCursor = 0
    this.remote = false
    this.chests = new Map()
    this.enderChests = new Map()
    this.tileEntities = new Map()
    this.removedTileEntities = new Map()
    this.loadOffsetCache = new Map()
	this.blockMeta = new Map()
	this._suppressPortalCleanup = false
    this._suppressPortalCleanup = false
  }

  tileEntityKey(wx, wy, wz) {
    return tileEntityKey(wx, wy, wz)
  }

  getTileEntity(wx, wy, wz) {
    return this.tileEntities.get(this.tileEntityKey(wx, wy, wz)) || null
  }

  setTileEntity(entity) {
    if (!entity) return null
    const key = this.tileEntityKey(entity.x, entity.y, entity.z)
    this.tileEntities.set(key, entity)
    if (entity.type === 'chest' && entity.inventory) {
      entity.inventory.facing = entity.facing || entity.inventory.facing || 'south'
      this.chests.set(key, entity.inventory)
    }
    return entity
  }

  setTileEntityFromData(data) {
    const entity = createTileEntityFromData(data)
    return entity ? this.setTileEntity(entity) : null
  }

  removeTileEntity(wx, wy, wz) {
    const key = this.tileEntityKey(wx, wy, wz)
    const entity = this.tileEntities.get(key)
    this.tileEntities.delete(key)
    if (entity) this.removedTileEntities.set(key, entity)
    if (!entity || entity.type === 'chest') this.chests.delete(key)
    return entity || null
  }

  consumeRemovedTileEntity(wx, wy, wz) {
    const key = this.tileEntityKey(wx, wy, wz)
    const entity = this.removedTileEntities.get(key) || null
    this.removedTileEntities.delete(key)
    return entity
  }

  ensureTileEntityForBlock(wx, wy, wz, blockName) {
    const key = this.tileEntityKey(wx, wy, wz)
    let entity = this.tileEntities.get(key)
    if (entity && entity.type === blockName) return entity
    const previous = entity?.serialize ? entity.serialize() : null
    entity = createTileEntityForBlock(blockName, wx, wy, wz)
    if (!entity) return null
    if (previous && previous.type === entity.type) entity.load(previous)
    return this.setTileEntity(entity)
  }

  syncTileEntityForBlock(wx, wy, wz, id) {
    const def = blocks[id]
    const next = createTileEntityForBlock(def?.name, wx, wy, wz)
    const key = this.tileEntityKey(wx, wy, wz)
    const existing = this.tileEntities.get(key)
    if (!next) {
      if (existing) this.removeTileEntity(wx, wy, wz)
      else this.chests.delete(key)
      return null
    }
    if (existing && existing.type === next.type) return existing
    if (existing?.serialize) next.load(existing.serialize())
    this.setTileEntity(next)
    return next
  }

  tickTileEntities(dt, context = {}) {
    for (const entity of this.tileEntities.values()) {
      if (entity && typeof entity.tick === 'function') entity.tick(dt, this, context)
    }
  }

  serializeTileEntities() {
    const out = {}
    for (const [key, entity] of this.tileEntities.entries()) {
      if (entity && typeof entity.serialize === 'function') out[key] = entity.serialize()
    }
    return out
  }

  loadTileEntities(data) {
    if (!data) return
    this.tileEntities = new Map()
    this.chests = new Map()
    const entries = Array.isArray(data) ? data.map((item) => [this.tileEntityKey(item.x, item.y, item.z), item]) : Object.entries(data)
    for (const [, value] of entries) {
      this.setTileEntityFromData(value)
    }
  }

  getSingleChestInventory(wx, wy, wz) {
    const key = `${wx},${wy},${wz}`
    let entity = this.tileEntities.get(key)
    if (!(entity instanceof ChestTileEntity)) {
      entity = new ChestTileEntity(wx, wy, wz)
      const existing = this.chests.get(key)
      if (existing) {
        entity.inventory = existing
        entity.facing = existing.facing || entity.facing
      }
      this.setTileEntity(entity)
    }
    entity.inventory.facing = entity.facing || entity.inventory.facing || 'south'
    this.chests.set(key, entity.inventory)
    return entity.inventory
  }

  getPairedChest(x, y, z) {
    const CHEST = blockIds.CHEST
    if (this.getBlock(x, y, z) !== CHEST) return null

    const key = `${x},${y},${z}`
    const currentFacing = this.chests.get(key)?.facing || 'south'

    const neighbors = []
    if (currentFacing === 'north' || currentFacing === 'south') {
      neighbors.push({ x: x + 1, y, z })
      neighbors.push({ x: x - 1, y, z })
    } else {
      neighbors.push({ x, y, z: z + 1 })
      neighbors.push({ x, y, z: z - 1 })
    }

    for (const n of neighbors) {
      if (this.getBlock(n.x, y, n.z) === CHEST) {
        const neighborFacing = this.chests.get(`${n.x},${y},${n.z}`)?.facing || 'south'
        if (neighborFacing !== currentFacing) continue

        let nNeighbors = []
        if (neighborFacing === 'north' || neighborFacing === 'south') {
          nNeighbors.push({ x: n.x + 1, y, z: n.z })
          nNeighbors.push({ x: n.x - 1, y, z: n.z })
        } else {
          nNeighbors.push({ x: n.x, y, z: n.z + 1 })
          nNeighbors.push({ x: n.x, y, z: n.z - 1 })
        }

        let alreadyPaired = false
        for (const nn of nNeighbors) {
          if (nn.x === x && nn.z === z) continue
          if (this.getBlock(nn.x, y, nn.z) === CHEST) {
            alreadyPaired = true
            break
          }
        }
        if (!alreadyPaired) {
          return n
        }
      }
    }
    return null
  }

  getChestInventory(wx, wy, wz) {
    const paired = this.getPairedChest(wx, wy, wz)
    if (paired) {
      const isFirst = (wx < paired.x) || (wx === paired.x && wz < paired.z)
      const leftCoord = isFirst ? { x: wx, y: wy, z: wz } : paired
      const rightCoord = isFirst ? paired : { x: wx, y: wy, z: wz }

      const leftInv = this.getSingleChestInventory(leftCoord.x, leftCoord.y, leftCoord.z)
      const rightInv = this.getSingleChestInventory(rightCoord.x, rightCoord.y, rightCoord.z)

      const doubleInv = new DoubleChestInventory(leftInv, rightInv)
      doubleInv.facing = leftInv.facing
      doubleInv.isOpen = leftInv.isOpen || rightInv.isOpen
      return doubleInv
    }
    return this.getSingleChestInventory(wx, wy, wz)
  }

  getPlayerEnderChestKey(playerKey) {
    return String(playerKey || 'player')
  }

  getEnderChestInventory(playerKey) {
    const key = this.getPlayerEnderChestKey(playerKey)
    if (!this.enderChests.has(key)) {
      const inv = new Inventory(27)
      inv.isEnderChest = true
      this.enderChests.set(key, inv)
    }
    const inv = this.enderChests.get(key)
    inv.isEnderChest = true
    return inv
  }


  fireKey(wx, wy, wz) {
    return wx + ',' + wy + ',' + wz
  }

  trackFireBlock(wx, wy, wz, id) {
    const key = this.fireKey(wx, wy, wz)
    if (id === blockIds.FIRE || id === blockIds.LAVA) {
      this.firePositions.set(key, { x: wx, y: wy, z: wz, id })
    } else if (this.firePositions.has(key)) {
      this.firePositions.delete(key)
    }
  }

  indexChunkFires(chunk) {
    const ox = chunk.cx * CHUNK_SIZE
    const oz = chunk.cz * CHUNK_SIZE
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const id = chunk.get(x, y, z)
          if (id === blockIds.FIRE || id === blockIds.LAVA) {
            this.trackFireBlock(ox + x, y, oz + z, id)
          }
        }
      }
    }
  }

  getChunk(cx, cz) {
    return this.chunks.get(chunkKey(cx, cz)) || null
  }

  ensureChunk(cx, cz) {
    const key = chunkKey(cx, cz)
    let chunk = this.chunks.get(key)
    if (!chunk) {
      chunk = new Chunk(cx, cz)
      this.chunks.set(key, chunk)
      if (DEBUG_GENERATION) debugLog('world', `creating chunk ${cx},${cz}`, { seed: this.seed })
      this.terrain.generate(chunk)
      this.indexChunkFires(chunk)
      // A newly generated chunk gives its neighbors real block data at the
      // shared border. Any already-meshed neighbor was built assuming this
      // side was AIR, so it has phantom boundary faces — mark them dirty so
      // they rebuild against the now-present geometry.
      this.markDirty(cx + 1, cz)
      this.markDirty(cx - 1, cz)
      this.markDirty(cx, cz + 1)
      this.markDirty(cx, cz - 1)
    }
    return chunk
  }

  getBlock(wx, wy, wz) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return AIR
    const cx = floorDiv(wx, CHUNK_SIZE)
    const cz = floorDiv(wz, CHUNK_SIZE)
    const chunk = this.getChunk(cx, cz)
    if (!chunk) return AIR
    return chunk.get(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE)
  }

  getLevel(wx, wy, wz) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return 0
    const cx = floorDiv(wx, CHUNK_SIZE)
    const cz = floorDiv(wz, CHUNK_SIZE)
    const chunk = this.getChunk(cx, cz)
    if (!chunk) return 0
    return chunk.getLevel(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE)
  }
   getBlockMeta(wx, wy, wz) {
  return this.blockMeta.get(`${wx},${wy},${wz}`) || null
}

setBlockMeta(wx, wy, wz, meta) {
  this.blockMeta.set(`${wx},${wy},${wz}`, meta)
}

removeBlockMeta(wx, wy, wz) {
  this.blockMeta.delete(`${wx},${wy},${wz}`)
}

  setLevel(wx, wy, wz, n) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return
    const cx = floorDiv(wx, CHUNK_SIZE)
    const cz = floorDiv(wz, CHUNK_SIZE)
    const chunk = this.getChunk(cx, cz)
    if (!chunk) return
    chunk.setLevel(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE, n)
    this.markDirty(cx, cz)
  }

  setBlock(wx, wy, wz, id) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return
    const cx = floorDiv(wx, CHUNK_SIZE)
    const cz = floorDiv(wz, CHUNK_SIZE)
    const chunk = this.ensureChunk(cx, cz)
    const lx = wx - cx * CHUNK_SIZE
    const lz = wz - cz * CHUNK_SIZE
    const previousId = chunk.get(lx, wy, lz)

if (id === AIR) {
  this.removeBlockMeta(wx, wy, wz)
}

chunk.setEdit(lx, wy, lz, id)
this.updateWallTorches(wx, wy, wz)
    chunk.lightDirty = true
    chunk.lightMap = null
    if (id === blockIds.WATER) this.setLevel(wx, wy, wz, 0)
    this.trackFireBlock(wx, wy, wz, id)
    this.syncTileEntityForBlock(wx, wy, wz, id)
    // Only schedule fluid ticks when this change can actually affect fluids:
    // the new block is a fluid, OR one of its neighbors is. Avoids spamming
    // 5 ticks per setBlock during normal building.
    const isFluid = (bid) => bid === blockIds.WATER || bid === blockIds.LAVA
    if (isFluid(id)) {
      this.scheduleFluidTick(wx, wy, wz)
    }
    if (isFluid(this.getBlock(wx + 1, wy, wz))) this.scheduleFluidTick(wx + 1, wy, wz)
    if (isFluid(this.getBlock(wx - 1, wy, wz))) this.scheduleFluidTick(wx - 1, wy, wz)
    if (isFluid(this.getBlock(wx, wy, wz + 1))) this.scheduleFluidTick(wx, wy, wz + 1)
    if (isFluid(this.getBlock(wx, wy, wz - 1))) this.scheduleFluidTick(wx, wy, wz - 1)
    if (isFluid(this.getBlock(wx, wy + 1, wz))) this.scheduleFluidTick(wx, wy + 1, wz)
    this.markDirty(cx, cz)
    if (this.getChunk(cx + 1, cz)) this.getChunk(cx + 1, cz).invalidateLightMap()
    if (this.getChunk(cx - 1, cz)) this.getChunk(cx - 1, cz).invalidateLightMap()
    if (this.getChunk(cx, cz + 1)) this.getChunk(cx, cz + 1).invalidateLightMap()
    if (this.getChunk(cx, cz - 1)) this.getChunk(cx, cz - 1).invalidateLightMap()
    if (lx === 0) this.markDirty(cx - 1, cz)
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz)
    if (lz === 0) this.markDirty(cx, cz - 1)
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1)
    if (typeof this.onBlockChanged === 'function') this.onBlockChanged(wx, wy, wz, id)

    if (!this._suppressPortalCleanup) {
      const changedObsidianFrame = previousId === blockIds.OBSIDIAN && id !== blockIds.OBSIDIAN
      const replacedPortalWithFluid = previousId === blockIds.FIRE_PORTAL && (id === blockIds.WATER || id === blockIds.LAVA)
      const fluidNearPortal = (id === blockIds.WATER || id === blockIds.LAVA) && this.hasPortalNear(wx, wy, wz, 2)
      if (changedObsidianFrame || replacedPortalWithFluid || fluidNearPortal) {
        this.deactivatePortalNear(wx, wy, wz)
      }
    }

    if (!this._isSettling) {
      this._isSettling = true
      try {
        if (this.isPassable(wx, wy, wz)) {
          this.settleAbove(wx, wy, wz)
        } else {
          this.settleBlock(wx, wy, wz)
        }
      } finally {
        this._isSettling = false
      }
    }
	const name = blocks[id]?.name

if (
  name === 'wall_torch_north' ||
  name === 'wall_torch_south' ||
  name === 'wall_torch_east' ||
  name === 'wall_torch_west'
) {
  let sx = wx
  let sz = wz

  if (name === 'wall_torch_north') sz += 1
  if (name === 'wall_torch_south') sz -= 1
  if (name === 'wall_torch_east') sx -= 1
  if (name === 'wall_torch_west') sx += 1

  if (!blocks[this.getBlock(sx, wy, sz)]?.solid) {
    this.setBlock(wx, wy, wz, AIR)
    return
  }
}
  }

  // Apply a host-sent block delta on the client. Behaviorally identical to
  // setBlock today, but kept as a distinct entry point so future host-side
  // logic (gravity settling, etc.) can run only on the authoritative side.
  setBlockSilent(wx, wy, wz, id) {
    this.setBlock(wx, wy, wz, id)
  }

  markAllLoadedDirty({ light = false, sky = false } = {}) {
    for (const chunk of this.chunks.values()) {
      chunk.dirty = true
      if (light) chunk.invalidateLightMap()
      if (sky) chunk.invalidateSkyMap()
    }
  }

  hasPortalNear(wx, wy, wz, radius = 2) {
    const portalId = blockIds.FIRE_PORTAL
    if (!portalId) return false
    for (let y = wy - radius; y <= wy + radius; y++) {
      for (let z = wz - radius; z <= wz + radius; z++) {
        for (let x = wx - radius; x <= wx + radius; x++) {
          if (this.getBlock(x, y, z) === portalId) return true
        }
      }
    }
    return false
  }

  deactivatePortalNear(wx, wy, wz, radius = 5) {
    const portalId = blockIds.FIRE_PORTAL
    if (!portalId) return 0
    let removed = 0
    this._suppressPortalCleanup = true
    try {
      for (let y = wy - radius; y <= wy + radius; y++) {
        if (y < 0 || y >= CHUNK_HEIGHT) continue
        for (let z = wz - radius; z <= wz + radius; z++) {
          for (let x = wx - radius; x <= wx + radius; x++) {
            if (this.getBlock(x, y, z) !== portalId) continue
            this.setBlock(x, y, z, AIR)
            removed++
          }
        }
      }
    } finally {
      this._suppressPortalCleanup = false
    }
    return removed
  }

  // Pack a chunk for transit. Returns { cx, cz, voxels: Uint16Array } — the
  // caller is responsible for any encoding (e.g. base64 for the JSON envelope).
  serializeChunkData(cx, cz) {
    const chunk = this.getChunk(cx, cz)
    if (!chunk) return null
    return { cx, cz, voxels: chunk.voxels, levels: chunk.levels }
  }

  // Inject a host-sent chunk on the client side. Skips terrain.generate so
  // the client never runs noise/biome work and always matches host bit-for-bit.
  applyChunkData(cx, cz, voxels, levels) {
    const key = chunkKey(cx, cz)
    let chunk = this.chunks.get(key)
    if (!chunk) {
      chunk = new Chunk(cx, cz)
      this.chunks.set(key, chunk)
      this.markDirty(cx + 1, cz)
      this.markDirty(cx - 1, cz)
      this.markDirty(cx, cz + 1)
      this.markDirty(cx, cz - 1)
    }
    chunk.loadVoxels(voxels, levels)
    chunk.dirty = true
    this.indexChunkFires(chunk)
  }

  scheduleFluidTick(wx, wy, wz) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return
    // Hard cap to prevent runaway memory growth if propagation outpaces the
    // per-frame budget (e.g. a flooded area). Dropped ticks will be
    // rescheduled the next time a neighbor changes.
    if (this.tickQueue.length - this.tickHead >= 4000) return
    const key = wx + ',' + wy + ',' + wz
    if (this.tickKeys.has(key)) return
    this.tickKeys.add(key)
    this.tickQueue.push({ x: wx, y: wy, z: wz, key })
  }

  isFlammable(id) {
    const def = blocks[id]
    if (!def) return false
    return ['oak_log', 'oak_leaves', 'oak_planks', 'crafting_table', 'chest', 'ladder'].includes(def.name)
  }

  tryIgnite(wx, wy, wz) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return false
    const id = this.getBlock(wx, wy, wz)
    if (id !== AIR) return false
    this.setBlock(wx, wy, wz, blockIds.FIRE)
    return true
  }

  setWaterLevel(wx, wy, wz, level) {
    const id = this.getBlock(wx, wy, wz)
    if (id !== AIR && id !== blockIds.WATER) return false
    if (id === blockIds.WATER && this.getLevel(wx, wy, wz) <= level) return false
    if (id !== blockIds.WATER) this.setBlock(wx, wy, wz, blockIds.WATER)
    this.setLevel(wx, wy, wz, level)
    this.scheduleFluidTick(wx, wy, wz)
    return true
  }

  setLavaLevel(wx, wy, wz, level) {
    const id = this.getBlock(wx, wy, wz)
    if (id !== AIR && id !== blockIds.LAVA) return false
    if (id === blockIds.LAVA && this.getLevel(wx, wy, wz) <= level) return false
    if (id !== blockIds.LAVA) this.setBlock(wx, wy, wz, blockIds.LAVA)
    this.setLevel(wx, wy, wz, level)
    this.scheduleFluidTick(wx, wy, wz)
    return true
  }

  processFluidTick(wx, wy, wz) {
    const id = this.getBlock(wx, wy, wz)
    if (id !== blockIds.WATER && id !== blockIds.LAVA) return
    const level = this.getLevel(wx, wy, wz)
    if (id === blockIds.WATER) {
      if (this.setWaterLevel(wx, wy - 1, wz, level)) return
      if (level >= 7) return
      const next = level + 1
      this.setWaterLevel(wx + 1, wy, wz, next)
      this.setWaterLevel(wx - 1, wy, wz, next)
      this.setWaterLevel(wx, wy, wz + 1, next)
      this.setWaterLevel(wx, wy, wz - 1, next)
      return
    }
    if (((wx + wy + wz) & 3) !== 0) return
    if (this.getBlock(wx, wy - 1, wz) === AIR) {
      this.setBlock(wx, wy - 1, wz, blockIds.LAVA)
      this.setLevel(wx, wy - 1, wz, Math.min(7, level + 1))
      return
    }
    if (level >= 7) return
    const next = level + 1
    this.setLavaLevel(wx + 1, wy, wz, next)
    this.setLavaLevel(wx - 1, wy, wz, next)
    this.setLavaLevel(wx, wy, wz + 1, next)
    this.setLavaLevel(wx, wy, wz - 1, next)
  }

  updateFluidTicks(maxTicks = 24) {
    let count = 0
    while (this.tickHead < this.tickQueue.length && count < maxTicks) {
      const item = this.tickQueue[this.tickHead++]
      this.tickKeys.delete(item.key)
      this.processFluidTick(item.x, item.y, item.z)
      count++
    }
    if (this.tickHead > 512 && this.tickHead > this.tickQueue.length / 2) {
      this.tickQueue = this.tickQueue.slice(this.tickHead)
      this.tickHead = 0
    } else if (this.tickHead >= this.tickQueue.length) {
      this.tickQueue.length = 0
      this.tickHead = 0
    }
  }

  updateFireSpread(maxChecks = 24) {
    if (this.firePositions.size === 0) return
    // Snapshot so newly-ignited blocks added by tryIgnite during this pass
    // don't get re-processed in the same frame.
    const positions = [...this.firePositions.values()]
    const start = this.fireScanCursor % positions.length
    const limit = Math.min(maxChecks, positions.length)
    for (let i = 0; i < limit; i++) {
      const pos = positions[(start + i) % positions.length]
      // Position might have been cleared between snapshot and now.
      if (!this.firePositions.has(this.fireKey(pos.x, pos.y, pos.z))) continue
      // Age fire blocks; lava is excluded.
      if (pos.id !== blockIds.LAVA) {
        pos.age = (pos.age || 0) + 1
        // Once fire has been alive long enough, consume one flammable
        // neighbor (turns leaves/wood/wool into a new fire block).
        if (pos.age >= 4) {
          const neighbors = [
            [pos.x+1,pos.y,pos.z],[pos.x-1,pos.y,pos.z],
            [pos.x,pos.y+1,pos.z],[pos.x,pos.y-1,pos.z],
            [pos.x,pos.y,pos.z+1],[pos.x,pos.y,pos.z-1]
          ]
          let consumed = false
          for (const [nx, ny, nz] of neighbors) {
            const nid = this.getBlock(nx, ny, nz)
            if (this.isFlammable(nid)) {
              this.setBlock(nx, ny, nz, blockIds.FIRE)
              consumed = true
              break
            }
          }
          // After consuming a neighbor (or if fire is very old with no fuel),
          // the source fire dies out.
          if (consumed || pos.age >= 12) {
            this.setBlock(pos.x, pos.y, pos.z, AIR)
            continue
          }
          pos.age = 0
        }
      }
      const offsets = pos.id === blockIds.LAVA
        ? [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[1,1,0],[-1,1,0],[0,1,1],[0,1,-1],[1,1,1],[-1,1,1],[1,1,-1],[-1,1,-1]]
        : [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[1,1,0],[-1,1,0],[0,1,1],[0,1,-1],[1,1,1],[-1,1,1],[1,1,-1],[-1,1,-1],[0,2,0],[1,2,0],[-1,2,0],[0,2,1],[0,2,-1],[1,2,1],[-1,2,1],[1,2,-1],[-1,2,-1],[0,3,0],[0,4,0]]
      for (const [dx, dy, dz] of offsets) {
        const tx = pos.x + dx
        const ty = pos.y + dy
        const tz = pos.z + dz
        const targetId = this.getBlock(tx, ty, tz)
        if (!this.isFlammable(targetId)) continue
        const airTargets = [
          [tx + 1, ty, tz], [tx - 1, ty, tz], [tx, ty + 1, tz], [tx, ty - 1, tz], [tx, ty, tz + 1], [tx, ty, tz - 1]
        ]
        for (const [ax, ay, az] of airTargets) {
          if (this.getBlock(ax, ay, az) === AIR) this.tryIgnite(ax, ay, az)
        }
      }
    }
    this.fireScanCursor = (start + limit) % positions.length
  }

  markDirty(cx, cz) {
    const chunk = this.getChunk(cx, cz)
    if (chunk) chunk.dirty = true
  }

  isPassable(wx, wy, wz) {
    const id = this.getBlock(wx, wy, wz)
    if (id === AIR) return true
    const b = blocks[id]
    if (!b) return true
    return b.liquid === true || b.solid === false
  }
  updateWallTorches(wx, wy, wz) {
  const checks = [
    [1,0,0],
    [-1,0,0],
    [0,0,1],
    [0,0,-1]
  ]

  for (const [dx,dy,dz] of checks) {
    const id = this.getBlock(wx + dx, wy + dy, wz + dz)
    const name = blocks[id]?.name

    if (!name) continue

    let supportX = wx + dx
    let supportZ = wz + dz

    if (name === 'wall_torch_north') supportZ += 1
    else if (name === 'wall_torch_south') supportZ -= 1
    else if (name === 'wall_torch_east') supportX -= 1
    else if (name === 'wall_torch_west') supportX += 1
    else continue

    if (!blocks[this.getBlock(supportX, wy, supportZ)]?.solid) {
      this.setBlock(wx + dx, wy + dy, wz + dz, AIR)
    }
  }
}

  settleBlock(wx, wy, wz) {
    const id = this.getBlock(wx, wy, wz)
    if (id === AIR) return
    const def = blocks[id]
    if (!def || !def.gravity) return
    let ty = wy
    while (ty > 0 && this.isPassable(wx, ty - 1, wz)) ty--
    if (ty === wy) return
    this.fallingBlockSystem.start(wx, wy, wz, id)
    this.settleAbove(wx, wy, wz)
  }
  

  settleAbove(wx, wy, wz) {
    let y = wy + 1
    while (y < CHUNK_HEIGHT) {
      const id = this.getBlock(wx, y, wz)
      if (id === AIR) break
      const def = blocks[id]
      if (!def || !def.gravity) break
      this.settleBlock(wx, y, wz)
      y++
    }
  }

  // A chunk is ready to mesh when every neighbor that COULD still load has
  // loaded. A neighbor beyond the load region (circular radius rd around the
  // player) will never appear, so we don't wait on it — we mesh now and rely
  // on ensureChunk marking this chunk dirty if that neighbor ever does load.
  neighborsReady(chunk, pcx, pcz, rd) {
    const dirs = [
      [chunk.cx + 1, chunk.cz],
      [chunk.cx - 1, chunk.cz],
      [chunk.cx, chunk.cz + 1],
      [chunk.cx, chunk.cz - 1]
    ]
    for (const [nx, nz] of dirs) {
      if (this.getChunk(nx, nz)) continue
      const ddx = nx - pcx
      const ddz = nz - pcz
      // Missing, but still inside the loadable region — wait for it.
      if (ddx * ddx + ddz * ddz <= rd * rd) return false
    }
    return true
  }

  neighborsOf(chunk) {
    return {
      xpos: this.getChunk(chunk.cx + 1, chunk.cz),
      xneg: this.getChunk(chunk.cx - 1, chunk.cz),
      zpos: this.getChunk(chunk.cx, chunk.cz + 1),
      zneg: this.getChunk(chunk.cx, chunk.cz - 1)
    }
  }

  loadOffsetsForRadius(rd) {
    if (this.loadOffsetCache.has(rd)) return this.loadOffsetCache.get(rd)
    const offsets = []
    for (let dz = -rd; dz <= rd; dz++) {
      for (let dx = -rd; dx <= rd; dx++) {
        const d2 = dx * dx + dz * dz
        if (d2 > rd * rd) continue
        offsets.push({ dx, dz, d2 })
      }
    }
    offsets.sort((a, b) => a.d2 - b.d2 || Math.abs(a.dx) + Math.abs(a.dz) - (Math.abs(b.dx) + Math.abs(b.dz)))
    this.loadOffsetCache.set(rd, offsets)
    return offsets
  }

  rebuildChunk(chunk) {
    if (DEBUG_TEXTURES) {
      debugLog('world', `rebuilding chunk ${chunk.cx},${chunk.cz}`, {
        atlasTileCount: this.atlas.tileCount,
        atlasRows: this.atlas.rows,
        materialMapSize: this.material?.map?.image ? {
          width: this.material.map.image.width,
          height: this.material.map.image.height
        } : null
      })
    }
    if (chunk.lightDirty || !chunk.lightMap) {
      computeChunkLightMap(chunk, this)
    }
    if (chunk.skyDirty || !chunk.skyMap) {
      computeChunkSkyMap(chunk)
    }
    const neighbors = this.neighborsOf(chunk)
    const geo = meshChunk(chunk, this.atlas, neighbors, this)
    if (chunk.mesh) {
      this.scene.remove(chunk.mesh)
      chunk.mesh.geometry.dispose()
      chunk.mesh = null
    }
    if (chunk.transparentMesh) {
      this.scene.remove(chunk.transparentMesh)
      chunk.transparentMesh.geometry.dispose()
      chunk.transparentMesh = null
    }
    const ox = chunk.cx * CHUNK_SIZE
    const oz = chunk.cz * CHUNK_SIZE
    if (geo.opaque) {
      const mesh = new THREE.Mesh(geo.opaque, this.material)
      mesh.position.set(ox, 0, oz)
      mesh.frustumCulled = true
      this.scene.add(mesh)
      chunk.mesh = mesh
    }
    if (geo.transparent) {
      const mesh = new THREE.Mesh(geo.transparent, this.transparentMaterial)
      mesh.position.set(ox, 0, oz)
      mesh.frustumCulled = true
      this.scene.add(mesh)
      chunk.transparentMesh = mesh
    }
    chunk.dirty = false
  }

  update(playerX, playerZ, maxPerFrame) {
    const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
    const frameBudgetMs = 4
    const loadLimit = Math.max(1, maxPerFrame || 1)
	const dt = 1 / 60
    this.fallingBlockSystem.update(dt)
    this.updateFluidTicks(4)
    this.updateFireSpread(8)
    const pcx = floorDiv(playerX, CHUNK_SIZE)
    const pcz = floorDiv(playerZ, CHUNK_SIZE)
    const rd = this.renderDistance
    let loaded = 0
    for (const off of this.loadOffsetsForRadius(rd)) {
      const cx = pcx + off.dx
      const cz = pcz + off.dz
      const key = chunkKey(cx, cz)
      if (!this.remote && !this.chunks.has(key)) {
        this.ensureChunk(cx, cz)
        loaded++
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
        if (loaded >= loadLimit || now - start >= frameBudgetMs) break
      }
    }
    for (const [key, chunk] of this.chunks) {
      const dist = Math.max(Math.abs(chunk.cx - pcx), Math.abs(chunk.cz - pcz))
      if (dist > rd + 2) {
        if (chunk.mesh) { this.scene.remove(chunk.mesh); chunk.mesh.geometry.dispose() }
        if (chunk.transparentMesh) { this.scene.remove(chunk.transparentMesh); chunk.transparentMesh.geometry.dispose() }
        // Drop any fire/lava entries that lived in this chunk.
        const minX = chunk.cx * CHUNK_SIZE
        const maxX = minX + CHUNK_SIZE
        const minZ = chunk.cz * CHUNK_SIZE
        const maxZ = minZ + CHUNK_SIZE
        for (const [fkey, pos] of this.firePositions) {
          if (pos.x >= minX && pos.x < maxX && pos.z >= minZ && pos.z < maxZ) {
            this.firePositions.delete(fkey)
          }
        }
        this.chunks.delete(key)
      }
    }
    if (loaded > 0) return
    let remeshed = 0
    for (const [, chunk] of this.chunks) {
      const dist = Math.max(Math.abs(chunk.cx - pcx), Math.abs(chunk.cz - pcz))
      if (chunk.dirty && dist <= rd + 1 && this.neighborsReady(chunk, pcx, pcz, rd)) {
        this.rebuildChunk(chunk)
        remeshed++
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
        if (remeshed >= loadLimit || now - start >= frameBudgetMs) break
      }
    }
  }

  async prepareSpawnArea(cx, cz, radius, onProgress) {
    if (this.remote) {
      if (onProgress) onProgress(1, 1, 0, 'done')
      return
    }
    const coords = []
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        coords.push({ cx: cx + dx, cz: cz + dz })
      }
    }
    const total = coords.length

    for (let i = 0; i < total; i++) {
      const c = coords[i]
      this.ensureChunk(c.cx, c.cz)
      if (onProgress) onProgress(i, total, i, 'generating')
      if ((i & 3) === 3) await nextFrame()
    }

    for (let i = 0; i < total; i++) {
      const c = coords[i]
      const chunk = this.getChunk(c.cx, c.cz)
      if (onProgress) onProgress(i, total, i, 'meshing')
      if (chunk) this.rebuildChunk(chunk)
      if (onProgress) onProgress(i + 1, total, i, 'done')
      if ((i & 3) === 3) await nextFrame()
    }

    if (onProgress) onProgress(total, total, total - 1, 'done')
  }

getCropNextStage(blockId) {
  const name = blocks[blockId]?.name;
  if (!name || !name.includes('_stage_')) return null;
  const parts = name.split('_stage_');
  if (parts.length !== 2) return null;
  const baseName = parts[0];
  const currentStage = parseInt(parts[1], 10);
  if (isNaN(currentStage) || currentStage >= 3) return null;
  const nextBlockName = `${baseName}_stage_${currentStage + 1}`;
  return blocksByName.get(nextBlockName)?.id || null;
}

isFarmland(wx, wy, wz) {
  const id = this.getBlock(wx, wy, wz);
  const def = blocks[id];
  return def && (def.name === 'dirt' || def.name === 'grass');
}

updateCropGrowth(maxChecks = 50) {
  const chunkKeys = Array.from(this.chunks.keys());
  if (chunkKeys.length === 0) return;
  for (let i = 0; i < maxChecks; i++) {
    const randomKey = chunkKeys[Math.floor(Math.random() * chunkKeys.length)];
    const chunk = this.chunks.get(randomKey);
    if (!chunk) continue;
    const x = Math.floor(Math.random() * CHUNK_SIZE);
    const z = Math.floor(Math.random() * CHUNK_SIZE);
    const y = Math.floor(Math.random() * CHUNK_HEIGHT);
    const wx = chunk.cx * CHUNK_SIZE + x;
    const wz = chunk.cz * CHUNK_SIZE + z;
    const blockId = chunk.get(x, y, z);
    const nextStageId = this.getCropNextStage(blockId);
    if (nextStageId) {
      if (this.isFarmland(wx, y - 1, wz)) {
        if (Math.random() < 0.1) {
          this.setBlock(wx, y, wz, nextStageId);
        }
      }
    }
  }
}

}
