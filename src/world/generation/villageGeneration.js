import { CHUNK_HEIGHT, CHUNK_SIZE } from '../../config/constants.js'
import { AIR, blockIds } from '../../blocks/registry.js'
import { makeRng, hashSeed } from '../../world/noise.js'
import { getThingByName } from '../../items/itemRegistry.js'

const VILLAGE_CHANCE = 0.007

function isPassable(world, x, y, z) {
  const id = world.getBlock(x, y, z)
  return id === AIR
}

export class VillageGeneration {
  constructor(mobManager, world) {
    this.mobManager = mobManager
    this.setWorld(world)
  }

  setWorld(world) {
    this.world = world
    if (!world.villageProcessed) world.villageProcessed = new Set()
    this.processed = world.villageProcessed
    this.seedHash = hashSeed(world.seed)
  }

  update() {
    for (const [key, chunk] of this.world.chunks) {
      if (!chunk.generated || this.processed.has(key)) continue
      this.processed.add(key)
      this.populateChunk(chunk)
    }
  }

  findSurface(wx, wz) {
    for (let y = CHUNK_HEIGHT - 3; y >= 1; y--) {
      const id = this.world.getBlock(wx, y, wz)
      if (id === AIR) continue
      if (id !== blockIds.GRASS && id !== blockIds.DIRT) return null
      if (isPassable(this.world, wx, y + 1, wz) && isPassable(this.world, wx, y + 2, wz) && isPassable(this.world, wx, y + 3, wz)) {
        return { x: wx, y, z: wz }
      }
      return null
    }
    return null
  }

  populateLootChest(wx, wy, wz, rng) {
    const inv = this.world.getChestInventory(wx, wy, wz)
    if (!inv) return
    inv.clear()
    inv.facing = 'south'
    const lootPool = ['coal', 'wheat', 'emerald', 'iron_ingot', 'gold_ingot', 'bread', 'apple']
    const numItems = 2 + Math.floor(rng() * 4) // 2 to 5 items
    for (let i = 0; i < numItems; i++) {
      const itemKey = lootPool[Math.floor(rng() * lootPool.length)]
      const item = getThingByName(itemKey)
      if (item) {
        const slot = Math.floor(rng() * 27)
        const count = 1 + Math.floor(rng() * 5)
        inv.slots[slot] = { id: item.id, count }
      }
    }
    inv.emit()
  }

  prepareFootprint(baseX, baseY, baseZ, radius, clearHeight = 8) {
    for (let x = -radius; x <= radius; x++) {
      for (let z = -radius; z <= radius; z++) {
        const wx = baseX + x
        const wz = baseZ + z
        for (let y = baseY + 1; y <= Math.min(CHUNK_HEIGHT - 1, baseY + clearHeight); y++) {
          this.world.setBlock(wx, y, wz, AIR)
        }
        for (let y = baseY - 1; y >= Math.max(1, baseY - 6); y--) {
          if (!isPassable(this.world, wx, y, wz)) break
          this.world.setBlock(wx, y, wz, blockIds.COBBLESTONE)
        }
      }
    }
  }

  buildSmallHouse(baseX, baseY, baseZ, rng) {
    this.prepareFootprint(baseX, baseY, baseZ, 3, 8)
    // 5x5 footprint, 4 block high walls + roof
    for (let x = -2; x <= 2; x++) {
      for (let z = -2; z <= 2; z++) {
        for (let y = 0; y <= 3; y++) {
          const wx = baseX + x
          const wy = baseY + y
          const wz = baseZ + z

          const isEdge = Math.abs(x) === 2 || Math.abs(z) === 2
          if (y === 0) {
            // Foundation
            this.world.setBlock(wx, wy, wz, blockIds.COBBLESTONE)
          } else if (y === 3) {
            // Roof support / ceiling
            this.world.setBlock(wx, wy, wz, blockIds.OAK_PLANKS)
          } else if (isEdge) {
            // Walls: corner pillars are Oak Log, wall faces are Oak Planks
            if (Math.abs(x) === 2 && Math.abs(z) === 2) {
              this.world.setBlock(wx, wy, wz, blockIds.OAK_LOG)
            } else {
              // Add windows of Glass on sides
              if (y === 1 && ((x === 0 && Math.abs(z) === 2) || (z === 0 && Math.abs(x) === 2))) {
                this.world.setBlock(wx, wy, wz, blockIds.GLASS)
              } else if (y === 1 && x === 0 && z === 2) {
                // Front door opening
                this.world.setBlock(wx, wy, wz, AIR)
              } else {
                this.world.setBlock(wx, wy, wz, blockIds.OAK_PLANKS)
              }
            }
          } else {
            // Inside air
            this.world.setBlock(wx, wy, wz, AIR)
          }
        }
      }
    }

    // Cobblestone A-frame roof on top
    for (let rx = -3; rx <= 3; rx++) {
      for (let rz = -3; rz <= 3; rz++) {
        const heightOffset = Math.abs(rx)
        if (heightOffset <= 2) {
          this.world.setBlock(baseX + rx, baseY + 4 + (2 - heightOffset), baseZ + rz, blockIds.COBBLESTONE)
        }
      }
    }

    // Inside furnishings: maybe a small table (pressure plate/fence) or chest!
    if (rng() < 0.6) {
      this.world.setBlock(baseX - 1, baseY + 1, baseZ - 1, blockIds.CHEST)
      this.populateLootChest(baseX - 1, baseY + 1, baseZ - 1, rng)
    }
  }

  buildMediumHouse(baseX, baseY, baseZ, rng) {
    this.prepareFootprint(baseX, baseY, baseZ, 4, 9)
    // 7x7 layout, prettier libraries with log arches
    for (let x = -3; x <= 3; x++) {
      for (let z = -3; z <= 3; z++) {
        for (let y = 0; y <= 4; y++) {
          const wx = baseX + x
          const wy = baseY + y
          const wz = baseZ + z

          const isEdge = Math.abs(x) === 3 || Math.abs(z) === 3
          if (y === 0) {
            this.world.setBlock(wx, wy, wz, blockIds.COBBLESTONE)
          } else if (y === 4) {
            this.world.setBlock(wx, wy, wz, blockIds.OAK_LOG)
          } else if (isEdge) {
            if (Math.abs(x) === 3 && Math.abs(z) === 3) {
              this.world.setBlock(wx, wy, wz, blockIds.OAK_LOG)
            } else {
              // Glass windows
              if ((y === 1 || y === 2) && ((x === -1 || x === 1) && Math.abs(z) === 3)) {
                this.world.setBlock(wx, wy, wz, blockIds.GLASS)
              } else if (y === 1 && x === 0 && z === 3) {
                this.world.setBlock(wx, wy, wz, AIR) // Door
              } else {
                this.world.setBlock(wx, wy, wz, blockIds.OAK_PLANKS)
              }
            }
          } else {
            this.world.setBlock(wx, wy, wz, AIR)
          }
        }
      }
    }

    // Cobblestone roof structure
    for (let rx = -4; rx <= 4; rx++) {
      for (let rz = -4; rz <= 4; rz++) {
        const heightOffset = Math.abs(rx)
        if (heightOffset <= 3) {
          this.world.setBlock(baseX + rx, baseY + 5 + (3 - heightOffset), baseZ + rz, blockIds.COBBLESTONE)
        }
      }
    }

    // Every medium library has a chest with random loot
    this.world.setBlock(baseX - 2, baseY + 1, baseZ - 2, blockIds.CHEST)
    this.populateLootChest(baseX - 2, baseY + 1, baseZ - 2, rng)
  }

  populateChunk(chunk) {
    const rng = makeRng(this.seedHash + ':village:' + chunk.cx + ':' + chunk.cz)
    if (rng() >= VILLAGE_CHANCE) return

    const ox = chunk.cx * CHUNK_SIZE
    const oz = chunk.cz * CHUNK_SIZE
    const centerX = ox + 5 + Math.floor(rng() * 6)
    const centerZ = oz + 5 + Math.floor(rng() * 6)
    const surface = this.findSurface(centerX, centerZ)
    if (!surface) return

    // Build paths between huts
    const pathX = surface.x
    const pathZ = surface.z
    for (let dx = -10; dx <= 10; dx++) {
      for (let dz = -10; dz <= 10; dz++) {
        if (Math.abs(dx) === 0 || Math.abs(dz) === 0) {
          const surf = this.findSurface(pathX + dx, pathZ + dz)
          if (surf) {
            this.world.setBlock(surf.x, surf.y, surf.z, blockIds.COBBLESTONE)
          }
        }
      }
    }

    // Build houses
    this.buildMediumHouse(surface.x, surface.y, surface.z, rng)
    this.buildSmallHouse(surface.x + 8, surface.y, surface.z, rng)
    this.buildSmallHouse(surface.x, surface.y, surface.z + 8, rng)

    // Spawning villagers
    this.mobManager.spawn('villager', surface.x + 0.5, surface.y + 1, surface.z + 0.5)
    this.mobManager.spawn('villager', surface.x + 8.5, surface.y + 1, surface.z + 0.5)
    this.mobManager.spawn('villager', surface.x + 0.5, surface.y + 1, surface.z + 8.5)
    this.mobManager.spawn('golem', surface.x + 3.5, surface.y + 1, surface.z + 3.5)
  }
}
