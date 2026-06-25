import { CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL } from '../config/constants.js'
import { NoiseField, makeRng, hashSeed } from './noise.js'
import { AIR, blockIds, blocks } from '../blocks/registry.js'
import { DEBUG_GENERATION, debugLog, blockName } from '../debug/debug.js'

function biomeOf(temperature, humidity) {
  if (temperature > 0.42 && temperature < 0.68 && humidity < 0.48) return 'open_plains'
  if (temperature > 0.66 && humidity < 0.33) return 'desert'
  if (temperature < 0.3) return 'snow'
  if (humidity > 0.66 && temperature > 0.4) return 'swamp'
  if (temperature > 0.55 && humidity > 0.4) return 'forest'
  if (temperature > 0.7) return 'mountains'
  return 'plains'
}

function surfaceFor(biome) {
  if (biome === 'desert') return { top: blockIds.SAND, filler: blockIds.SAND, fillerDepth: 4 }
  if (biome === 'snow') return { top: blockIds.GRASS, filler: blockIds.DIRT, fillerDepth: 4 }
  return { top: blockIds.GRASS, filler: blockIds.DIRT, fillerDepth: 4 }
}

// Apply biome amplitude/offset to the noise component only — multiplying the
// raw `SEA_LEVEL + noise*K` value pulls every biome's average toward 0 (so
// plains end up half-underwater and swamps drown). Splitting it lets each
// biome sit at its own average elevation above sea level.
function heightForBiome(biome, noise) {
  // noise is roughly in [-1, 1]
  const base = SEA_LEVEL + 4  // most biomes average ~4 blocks above sea level
  if (biome === 'mountains') return base + 16 + noise * 40
  if (biome === 'desert')    return base + 2  + noise * 10
  if (biome === 'swamp')     return SEA_LEVEL - 1 + noise * 4   // wet, near water
  if (biome === 'forest')    return base + 2  + noise * 12
  if (biome === 'snow')      return base + 6  + noise * 18
  return base + noise * 10  // plains
}

function treeChanceFor(biome) {
  if (biome === 'forest') return 0.06
  if (biome === 'open_plains') return 0
  if (biome === 'plains') return 0.012
  if (biome === 'swamp')  return 0.02
  return 0
}

export class TerrainGenerator {
  constructor(seed) {
    this.seed = seed
    this.noise = new NoiseField(seed)
    this.seedHash = hashSeed(seed)
  }

  // Deterministic per-column random in [0,1) — used for tree placement so
  // the same world coordinate always decides the same way regardless of
  // which chunk asks first.
  hashAt(worldX, worldZ, salt = 0) {
    const rng = makeRng(this.seedHash + ':' + worldX + ':' + worldZ + ':' + salt)
    return rng()
  }

  biomeAt(worldX, worldZ) {
    const t = this.noise.temperatureAt(worldX, worldZ)
    const h = this.noise.humidityAt(worldX, worldZ)
    return biomeOf(t, h)
  }

  // Smoothed height: sample a 3x3 around the column and average the biome-
  // adjusted heights. Softens cliffy seams between biomes without needing a
  // separate continentalness map.
  heightAt(worldX, worldZ) {
    let sum = 0
    let count = 0
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const wx = worldX + dx
        const wz = worldZ + dz
        const noise = this.noise.heightAt(wx, wz)
        const biome = this.biomeAt(wx, wz)
        sum += heightForBiome(biome, noise)
        count++
      }
    }
    return Math.floor(sum / count)
  }

  // Depth-biased ore distribution: iron dominates deep, coal stays general.
  // Single noise channel, smarter thresholds — closer to vein-clusters than
  // scattered blobs.
  oreAt(worldX, y, worldZ) {
    const n = this.noise.oreAt(worldX, y, worldZ)
    const vein = this.hashAt(worldX >> 2, worldZ >> 2, y >> 2)
    const rich = n + vein * 0.22
    if (y <= 14 && rich > 1.05) return blockIds.DIAMOND_ORE
    if (y <= 24 && rich > 1.02) return blockIds.REDSTONE_ORE
    if (y <= 32 && rich > 1.00) return blockIds.LAPIS_ORE
    if (y <= 34 && rich > 1.04) return blockIds.GOLD_ORE
    if (y >= 4 && y <= 32 && rich > 1.09) return blockIds.EMERALD_ORE
    if (y >= 8 && y <= 64 && rich > 0.98) return blockIds.IRON_ORE
    if (y >= 24 && y <= 80 && rich > 0.96) return blockIds.COPPER_ORE
    if (y >= 8 && y <= 96 && rich > 0.93) return blockIds.COAL_ORE
    return blockIds.STONE
  }

  caveAt(worldX, y, worldZ) {
    const c = this.noise.caveAt(worldX, y, worldZ)
    return c > 0.74
  }

  // Pick top/filler with beach + underwater overrides.
  surfaceForColumn(biome, height) {
    if (height <= SEA_LEVEL + 1 && height >= SEA_LEVEL - 1) {
      return { top: blockIds.SAND, filler: blockIds.SAND, fillerDepth: 4 }
    }
    if (height < SEA_LEVEL - 1) {
      return { top: blockIds.GRAVEL, filler: blockIds.DIRT, fillerDepth: 3 }
    }
    return surfaceFor(biome)
  }

  // Place an oak tree at (lx, baseY, lz). Writes are clipped to this chunk;
  // neighbor chunks grow their own, so seams may show small leaf gaps.
  placeTree(chunk, lx, baseY, lz) {
    const trunkHeight = 4 + Math.floor(this.hashAt(
      chunk.cx * CHUNK_SIZE + lx,
      chunk.cz * CHUNK_SIZE + lz,
      1
    ) * 3)  // 4..6
    const topY = baseY + trunkHeight
    for (let y = baseY; y < topY; y++) {
      if (y < 0 || y >= CHUNK_HEIGHT) continue
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue
      const cur = chunk.get(lx, y, lz)
      if (cur === AIR || cur === blockIds.GRASS) chunk.set(lx, y, lz, blockIds.OAK_LOG)
    }
    const layers = [
      { dy: trunkHeight - 2, r: 2 },
      { dy: trunkHeight - 1, r: 2 },
      { dy: trunkHeight,     r: 1 },
      { dy: trunkHeight + 1, r: 1 }
    ]
    for (const layer of layers) {
      const y = baseY + layer.dy
      if (y < 0 || y >= CHUNK_HEIGHT) continue
      for (let dx = -layer.r; dx <= layer.r; dx++) {
        for (let dz = -layer.r; dz <= layer.r; dz++) {
          if (layer.r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue
          const x = lx + dx
          const z = lz + dz
          if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) continue
          if (chunk.get(x, y, z) === AIR) chunk.set(x, y, z, blockIds.OAK_LEAVES)
        }
      }
    }
  }

  generate(chunk) {
    const ox = chunk.cx * CHUNK_SIZE
    const oz = chunk.cz * CHUNK_SIZE
    const surfaceHeights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE)
    const isTreeable = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE)
    const debugCounts = DEBUG_GENERATION ? new Map() : null
    const debugSurfaces = DEBUG_GENERATION ? [] : null

    const track = (id) => {
      if (!debugCounts) return
      debugCounts.set(id, (debugCounts.get(id) || 0) + 1)
    }

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const worldX = ox + x
        const worldZ = oz + z
        const biome = this.biomeAt(worldX, worldZ)
        let height = this.heightAt(worldX, worldZ)
        if (height < 1) height = 1
        if (height >= CHUNK_HEIGHT) height = CHUNK_HEIGHT - 1
        const surf = this.surfaceForColumn(biome, height)
        for (let y = 0; y <= height; y++) {
          let id = blockIds.STONE
          if (y === 0) {
            id = blockIds.BEDROCK
          } else if (y === height) {
            id = (height < SEA_LEVEL) ? surf.filler : surf.top
          } else if (y > height - surf.fillerDepth) {
            id = surf.filler
          } else {
            id = this.oreAt(worldX, y, worldZ)
          }
          if (this.caveAt(worldX, y, worldZ) && y > 1 && y < height) {
            id = AIR
          }
          chunk.set(x, y, z, id)
          track(id)
        }
        for (let y = height + 1; y <= SEA_LEVEL; y++) {
          if (chunk.get(x, y, z) === AIR) {
            chunk.set(x, y, z, blockIds.WATER)
            track(blockIds.WATER)
          }
        }
        surfaceHeights[z * CHUNK_SIZE + x] = height
        const treeable = height > SEA_LEVEL && surf.top === blockIds.GRASS && chunk.get(x, height, z) === blockIds.GRASS
        isTreeable[z * CHUNK_SIZE + x] = treeable ? 1 : 0
        if (debugSurfaces && debugSurfaces.length < 8) {
          debugSurfaces.push({
            worldX,
            worldZ,
            biome,
            height,
            topId: chunk.get(x, height, z),
            topName: blockName(blocks, chunk.get(x, height, z)),
            belowId: height > 0 ? chunk.get(x, height - 1, z) : AIR,
            belowName: height > 0 ? blockName(blocks, chunk.get(x, height - 1, z)) : 'air'
          })
        }
      }
    }

    // Tree pass — deterministic per world column, independent of chunk load order.
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        if (!isTreeable[z * CHUNK_SIZE + x]) continue
        const worldX = ox + x
        const worldZ = oz + z
        const biome = this.biomeAt(worldX, worldZ)
        const chance = treeChanceFor(biome)
        if (chance <= 0) continue
        if (this.hashAt(worldX, worldZ, 0) >= chance) continue
        // Spacing: tie-break against any 4-neighbor that also rolled a tree.
        let crowded = false
        const neighbors = [[-1,0],[1,0],[0,-1],[0,1]]
        for (let i = 0; i < neighbors.length; i++) {
          const dx = neighbors[i][0], dz = neighbors[i][1]
          const nWorldX = worldX + dx, nWorldZ = worldZ + dz
          const nBiome = this.biomeAt(nWorldX, nWorldZ)
          const nChance = treeChanceFor(nBiome)
          if (nChance > 0 && this.hashAt(nWorldX, nWorldZ, 0) < nChance) {
            if ((nWorldX + nWorldZ * 31) < (worldX + worldZ * 31)) { crowded = true; break }
          }
        }
        if (crowded) continue
        const baseY = surfaceHeights[z * CHUNK_SIZE + x] + 1
        if (baseY + 6 >= CHUNK_HEIGHT) continue
        this.placeTree(chunk, x, baseY, z)
      }
    }

    chunk.generated = true
    chunk.dirty = true
    if (DEBUG_GENERATION) {
      const counts = [...debugCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id, count]) => ({ id, name: blockName(blocks, id), count }))
      debugLog('terrain', `generated chunk ${chunk.cx},${chunk.cz}`, {
        origin: { x: ox, z: oz },
        counts,
        sampleSurfaces: debugSurfaces
      })
    }
  }
}
