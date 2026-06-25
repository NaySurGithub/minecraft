import { CHUNK_SIZE, CHUNK_HEIGHT } from '../config/constants.js'
import { AIR, blocks } from '../blocks/registry.js'
import { chunkKey } from '../world/chunk.js'
import { makeRng, hashSeed } from '../world/noise.js'
import { daylightFactor } from '../world/dayNightCycle.js'
import { getLightLevel } from '../world/lightEngine.js'

const PACK_CHANCE = 0.025
const INVALID_BIOMES = new Set(['desert', 'snow'])
const NETHER_MOBS = [
  'zombie_piglin',
  'piglin',
  'piglin_brute',
  'hoglin',
  'magma_cube',
  'blaze',
  'wither_skeleton',
  'strider',
  'enderman',
  'skeleton',
  'ghast'
]

// Hostile mobs only spawn in light level < 8
const HOSTILE_SPAWN_MAX_LIGHT = 7

export class PacificMobGeneration {
  constructor(mobManager, world) {
    this.mobManager = mobManager
    this.setWorld(world)
  }

  setWorld(world) {
    this.world = world
    if (!world.mobSpawnProcessed) world.mobSpawnProcessed = new Set()
    this.processed = world.mobSpawnProcessed
    this.seedHash = hashSeed(world.seed)
  }

  update(dt, playerPos) {
    for (const [key, chunk] of this.world.chunks) {
      if (!chunk.generated) continue
      if (this.processed.has(key)) continue
      this.processed.add(key)
      this.populateChunk(chunk)
    }
  }

  populateChunk(chunk) {
    const rng = makeRng(this.seedHash + ':mobs:' + chunk.cx + ':' + chunk.cz)
    if (rng() >= PACK_CHANCE) return
    if (this.world.dimension === 'nether') {
      this.populateNetherChunk(chunk, rng)
      return
    }

    const ox = chunk.cx * CHUNK_SIZE
    const oz = chunk.cz * CHUNK_SIZE
    const centerWorldX = ox + Math.floor(rng() * CHUNK_SIZE)
    const centerWorldZ = oz + Math.floor(rng() * CHUNK_SIZE)
    const biome = this.world.terrain.biomeAt(centerWorldX, centerWorldZ)
    if (INVALID_BIOMES.has(biome)) return

    // Determine what type of mob to try spawning here based on light level
    // We'll finalize per-candidate below; pick default pack params by time
    const isNight = daylightFactor((this.world.timeOfDay || 0) % 24000) < 0.2

    // Night = try zombies (small pack), day = sheep packs
    // Zombie count divided by ~3 compared to previous (was 4, now max 1-2)
    const defaultMobType = isNight ? 'zombie' : 'sheep'
    const packSize = isNight
      ? 1 + Math.floor(rng() * 2)       // 1-2 zombies (was 4)
      : 1 + Math.floor(rng() * 3)       // 1-3 sheep

    let spawned = 0
    let attempts = 0
    while (spawned < packSize && attempts < packSize * 6) {
      attempts++
      const wx = centerWorldX + Math.floor((rng() - 0.5) * 8)
      const wz = centerWorldZ + Math.floor((rng() - 0.5) * 8)
      const spot = this.findSurface(wx, wz)
      if (!spot) continue

      // Determine mob type by light level at spawn point
      const lightLevel = getLightLevel(this.world, spot.x, spot.y, spot.z, this.world.timeOfDay || 0)

      let mobType
      if (lightLevel <= HOSTILE_SPAWN_MAX_LIGHT) {
        // Dark enough for hostile mobs.
        const roll = rng()
        mobType = roll < 0.4 ? 'zombie' : roll < 0.75 ? 'creeper' : roll < 0.9 ? 'skeleton' : 'enderman'
      } else {
        // Too bright for hostile mobs, only peaceful can spawn
        if (defaultMobType === 'zombie') continue  // skip — no hostile spawn here
        mobType = 'sheep'
      }

      this.mobManager.spawn(mobType, spot.x, spot.y, spot.z)
      spawned++
    }
  }

  populateNetherChunk(chunk, rng) {
    const ox = chunk.cx * CHUNK_SIZE
    const oz = chunk.cz * CHUNK_SIZE
    const packSize = 1 + Math.floor(rng() * 3)
    let spawned = 0
    let attempts = 0
    while (spawned < packSize && attempts < packSize * 10) {
      attempts++
      const wx = ox + Math.floor(rng() * CHUNK_SIZE)
      const wz = oz + Math.floor(rng() * CHUNK_SIZE)
      const spot = this.findNetherSpot(wx, wz)
      if (!spot) continue
      const type = NETHER_MOBS[Math.floor(rng() * NETHER_MOBS.length)]
      const y = type === 'ghast' ? Math.min(CHUNK_HEIGHT - 8, spot.y + 5 + Math.floor(rng() * 8)) : spot.y
      this.mobManager.spawn(type, spot.x, y, spot.z)
      spawned++
    }
  }

  findNetherSpot(wx, wz) {
    for (let y = CHUNK_HEIGHT - 4; y >= 4; y--) {
      const id = this.world.getBlock(wx, y, wz)
      if (id === AIR) continue
      const def = blocks[id]
      if (!def || !def.solid || def.transparent || def.name === 'bedrock') continue
      const above1 = this.world.getBlock(wx, y + 1, wz)
      const above2 = this.world.getBlock(wx, y + 2, wz)
      if (this.isTransparent(above1) && this.isTransparent(above2)) return { x: wx + 0.5, y: y + 1, z: wz + 0.5 }
    }
    return null
  }

  findSurface(wx, wz) {
    // Scan from the top down to find the HIGHEST surface exposed to open sky.
    // We require a clear sky column above (no solid block anywhere above the
    // candidate), so mobs never spawn inside caves or under overhangs.
    for (let y = CHUNK_HEIGHT - 1; y >= 1; y--) {
      const id = this.world.getBlock(wx, y, wz)
      if (id === AIR) continue
      const def = blocks[id]
      // Must be a solid, opaque block to stand on.
      if (!def || !def.solid || def.transparent) continue
      // Need at least 2 clear blocks above for the mob to fit.
      const above1 = this.world.getBlock(wx, y + 1, wz)
      const above2 = this.world.getBlock(wx, y + 2, wz)
      if (!this.isTransparent(above1) || !this.isTransparent(above2)) continue
      // Crucially: make sure the sky is actually open above this spot.
      // Walk upward — if ANY solid block is found, this is underground.
      let skyOpen = true
      for (let sy = y + 3; sy < CHUNK_HEIGHT; sy++) {
        const sid = this.world.getBlock(wx, sy, wz)
        if (sid === AIR) continue
        const sdef = blocks[sid]
        if (sdef && sdef.solid && !sdef.transparent) { skyOpen = false; break }
      }
      if (!skyOpen) continue
      return { x: wx + 0.5, y: y + 1, z: wz + 0.5 }
    }
    return null
  }

  isTransparent(id) {
    if (id === AIR) return true
    const def = blocks[id]
    return !def || !def.solid || def.transparent === true
  }
}
