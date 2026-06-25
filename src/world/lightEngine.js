import { AIR, blocks } from '../blocks/registry.js'
import { daylightFactor } from '../world/dayNightCycle.js'
import { CHUNK_SIZE, CHUNK_HEIGHT } from '../config/constants.js'

const BLOCK_LIGHT_RADIUS = 14

const skyColumnCache = new Map()

function computeSkyBlocker(world, bx, bz) {
  for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
    const id = world.getBlock(bx, y, bz)
    if (id === AIR) continue

    const def = blocks[id]
    if (def?.solid && !def?.transparent) {
      return y
    }
  }
  return -Infinity
}

const OFFSETS = (() => {
  const list = []
  const r = BLOCK_LIGHT_RADIUS

  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        const dist = Math.abs(dx) + Math.abs(dy) + Math.abs(dz)
        if (dist === 0 || dist > r) continue
        list.push([dx,dy,dz,dist])
      }
    }
  }

  return list
})()

const _blocks = blocks
const _AIR = AIR

// =====================
// SKY LIGHT (runtime)
// =====================
export function getSkyLight(world, x, y, z, timeOfDay = 0) {
  const skyMax = world?.dimension === 'nether' ? 0 : Math.round(4 + daylightFactor(timeOfDay) * 11)

  const bx = Math.floor(x)
  const by = Math.floor(y)
  const bz = Math.floor(z)

  const key = bx + '|' + bz

  let blockerY = skyColumnCache.get(key)

  if (blockerY === undefined) {
    blockerY = computeSkyBlocker(world, bx, bz)
    skyColumnCache.set(key, blockerY)
  }

  if (blockerY === -Infinity || blockerY < by) return skyMax
  return 0
}

// =====================
// BLOCK LIGHT (runtime)
// =====================
export function getBlockLight(world, x, y, z) {
  const bx = Math.floor(x)
  const by = Math.floor(y)
  const bz = Math.floor(z)

  const getBlock = world.getBlock.bind(world)

  let best = 0

  for (let i = 0; i < OFFSETS.length; i++) {
    const [dx, dy, dz, dist] = OFFSETS[i]

    const id = getBlock(bx + dx, by + dy, bz + dz)
    if (!id || id === _AIR) continue

    const def = _blocks[id]
    if (!def || !def.light) continue

    const value = def.light - dist
    if (value > best) {
      best = value
      if (best >= 14) return best
    }
  }

  return best
}

// =====================
// TOTAL LIGHT
// =====================
export function getLightLevel(world, x, y, z, timeOfDay = 0) {
  const sky = getSkyLight(world, x, y, z, timeOfDay)
  const block = getBlockLight(world, x, y, z)
  return sky > block ? sky : block
}

// =====================================================
// LEGACY COMPATIBILITY (THIS FIXES YOUR NETLIFY BUILD)
// =====================================================

// used by world.js
export function computeChunkSkyMap(chunk) {
  const skyMap = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE)

  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      let top = -1

      for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
        const id = chunk.get(x, y, z)
        if (id === AIR) continue

        const def = blocks[id]
        if (def?.solid && !def.transparent) {
          top = y
          break
        }
      }

      skyMap[z * CHUNK_SIZE + x] = top === -1 ? 255 : top
    }
  }

  chunk.skyMap = skyMap
  chunk.skyDirty = false
  return skyMap
}

// used by mesher.js (fast fallback version)
export function getSkyLightFast(world, x, y, z, timeOfDay = 0) {
  return getSkyLight(world, x, y, z, timeOfDay)
}

// used by world.js (legacy chunk system)
export function computeChunkLightMap(chunk, world = null) {
  const lightMap = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT)

  const baseX = chunk.cx * CHUNK_SIZE
  const baseZ = chunk.cz * CHUNK_SIZE
  let propagatedSources = 0

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const id = chunk.get(x, y, z)
        const def = blocks[id]

        if (!def?.light) continue

        const index = (y * CHUNK_SIZE * CHUNK_SIZE) + (z * CHUNK_SIZE) + x
        lightMap[index] = def.light

        if (def.name === 'lava' && propagatedSources++ > 96) continue
        for (let i = 0; i < OFFSETS.length; i++) {
          const [dx, dy, dz, dist] = OFFSETS[i]
          const value = def.light - dist
          if (value <= 0) continue
          const lx = x + dx
          const ly = y + dy
          const lz = z + dz
          if (ly < 0 || ly >= CHUNK_HEIGHT) continue
          if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) {
            if (!world) continue
            const wx = baseX + lx
            const wz = baseZ + lz
            const worldId = world.getBlock(wx, ly, wz)
            const worldDef = blocks[worldId]
            if (worldDef?.solid && !worldDef?.transparent) continue
            continue
          }
          const targetId = chunk.get(lx, ly, lz)
          const targetDef = blocks[targetId]
          if (targetDef?.solid && !targetDef?.transparent) continue
          const targetIndex = (ly * CHUNK_SIZE * CHUNK_SIZE) + (lz * CHUNK_SIZE) + lx
          if (value > lightMap[targetIndex]) lightMap[targetIndex] = value
        }
      }
    }
  }

  chunk.lightMap = lightMap
  chunk.lightDirty = false
  return lightMap
}

// used by mesher.js
export function getBlockLightAtChunk(chunk, x, y, z) {
  if (!chunk?.lightMap) return 0

  const index = (y * CHUNK_SIZE * CHUNK_SIZE) + (z * CHUNK_SIZE) + x
  return chunk.lightMap[index] || 0
}
