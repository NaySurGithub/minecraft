import { REACH } from '../config/constants.js'
import { AIR, blocks } from '../blocks/registry.js'

export function raycastVoxel(world, origin, dir, maxDist) {
  const reach = maxDist || REACH
  let x = Math.floor(origin.x)
  let y = Math.floor(origin.y)
  let z = Math.floor(origin.z)

  const stepX = dir.x > 0 ? 1 : -1
  const stepY = dir.y > 0 ? 1 : -1
  const stepZ = dir.z > 0 ? 1 : -1

  const invX = dir.x !== 0 ? 1 / Math.abs(dir.x) : Infinity
  const invY = dir.y !== 0 ? 1 / Math.abs(dir.y) : Infinity
  const invZ = dir.z !== 0 ? 1 / Math.abs(dir.z) : Infinity

  const distToBound = (v, step) => {
    const frac = v - Math.floor(v)
    return step > 0 ? (1 - frac) : frac
  }

  let tMaxX = distToBound(origin.x, stepX) * invX
  let tMaxY = distToBound(origin.y, stepY) * invY
  let tMaxZ = distToBound(origin.z, stepZ) * invZ

  let nx = 0, ny = 0, nz = 0
  let t = 0

  while (t <= reach) {
    const id = world.getBlock(x, y, z)
    if (id !== AIR) {
      const b = blocks[id]
      if (b && (b.solid || b.liquid === false)) {
        if (b.solid) {
          return {
            block: { x, y, z },
            normal: { x: nx, y: ny, z: nz },
            id
          }
        }
      }
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX
      t = tMaxX
      tMaxX += invX
      nx = -stepX; ny = 0; nz = 0
    } else if (tMaxY < tMaxZ) {
      y += stepY
      t = tMaxY
      tMaxY += invY
      nx = 0; ny = -stepY; nz = 0
    } else {
      z += stepZ
      t = tMaxZ
      tMaxZ += invZ
      nx = 0; ny = 0; nz = -stepZ
    }
  }
  return null
}
