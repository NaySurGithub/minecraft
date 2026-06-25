import { PLAYER_HEIGHT, PLAYER_WIDTH, CHUNK_HEIGHT } from '../config/constants.js'
import { AIR, blocks, blockIds } from '../blocks/registry.js'

function aabbIntersectsBlock(px, py, pz, half, height, bx, by, bz) {
  const minX = px - half
  const maxX = px + half
  const minY = py
  const maxY = py + height
  const minZ = pz - half
  const maxZ = pz + half
  return (
    bx + 1 > minX && bx < maxX &&
    by + 1 > minY && by < maxY &&
    bz + 1 > minZ && bz < maxZ
  )
}

export function isReplaceable(world, x, y, z) {
  const id = world.getBlock(x, y, z)
  if (id === AIR) return true
  const b = blocks[id]
  if (!b) return true
  if (b.liquid) return true
  return !b.solid
}

export function canPlaceAt(world, player, x, y, z, blockId, otherPlayers = [], itemDef = null) {

  // Restrict seeds to farmland
  if (itemDef && itemDef.name && itemDef.name.endsWith('_seeds')) {
    const belowId = world.getBlock(x, y - 1, z)
    if (belowId !== blockIds.FARMLAND) return false
  }

  if (y < 0 || y >= CHUNK_HEIGHT) return false

  const def = blocks[blockId]
  if (!def) return false
  if (!def.placeable) return false
  if (def.item) return false

  if (!isReplaceable(world, x, y, z)) return false

  if (def.solid) {
    const half = PLAYER_WIDTH / 2
    if (aabbIntersectsBlock(
      player.position.x, player.position.y, player.position.z,
      half, PLAYER_HEIGHT,
      x, y, z
    )) return false
    for (const other of otherPlayers) {
      if (!other || !other.position) continue
      if (aabbIntersectsBlock(
        other.position.x, other.position.y, other.position.z,
        other.half == null ? half : other.half,
        other.height == null ? PLAYER_HEIGHT : other.height,
        x, y, z
      )) return false
    }
  }

  return true
}
