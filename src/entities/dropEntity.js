import * as THREE from 'three'
import { GRAVITY } from '../config/constants.js'
import { AIR, blocks } from '../blocks/registry.js'

const ITEM_HALF = 0.125
const PICKUP_RANGE = 1.4
const PICKUP_RANGE_SQ = PICKUP_RANGE * PICKUP_RANGE
const PICKUP_DELAY = 0.5
const DRAG = 0.6
const TERMINAL_VELOCITY = 30
const REST_EPSILON = 0.001

function isSolidAt(world, x, y, z) {
  const id = world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))
  if (id === AIR) return null
  const def = blocks[id]
  return !!(def && def.solid)
}

function collidesAt(world, minX, minY, minZ, maxX, maxY, maxZ) {
  const x0 = Math.floor(minX)
  const x1 = Math.floor(maxX)
  const y0 = Math.floor(minY)
  const y1 = Math.floor(maxY)
  const z0 = Math.floor(minZ)
  const z1 = Math.floor(maxZ)
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        if (isSolidAt(world, x + 0.5, y + 0.5, z + 0.5)) return true
      }
    }
  }
  return false
}

export class DropEntity {
  constructor(x, y, z, blockId, count) {
    this.position = new THREE.Vector3(x, y, z)
    this.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 1.5,
      2 + Math.random() * 0.5,
      (Math.random() - 0.5) * 1.5
    )
    this.blockId = blockId
    this.count = count || 1
    this.age = 0
    this.dead = false
    this.mesh = null
    this.onGround = false
  }

  update(dt, world, playerPos) {
    this.age += dt
    const feet = world.getBlock(Math.floor(this.position.x), Math.floor(this.position.y), Math.floor(this.position.z))
    if (blocks[feet]?.name === 'lava') {
      this.dead = true
      return
    }

    // Apply gravity
    this.velocity.y -= GRAVITY * dt
    if (this.velocity.y < -TERMINAL_VELOCITY) this.velocity.y = -TERMINAL_VELOCITY

    // Horizontal drag
    this.velocity.x *= (1 - DRAG * dt)
    this.velocity.z *= (1 - DRAG * dt)

    // Integrate axis-by-axis with collision against solid blocks
    this._moveAxis(world, 'y', this.velocity.y * dt)
    this._moveAxis(world, 'x', this.velocity.x * dt)
    this._moveAxis(world, 'z', this.velocity.z * dt)
  }

  _moveAxis(world, axis, delta) {
    if (delta === 0) return
    const p = this.position
    const next = p[axis] + delta
    const sign = Math.sign(delta)
    const half = ITEM_HALF

    const minX = (axis === 'x' ? next : p.x) - half
    const maxX = (axis === 'x' ? next : p.x) + half
    const minY = (axis === 'y' ? next : p.y) - half
    const maxY = (axis === 'y' ? next : p.y) + half
    const minZ = (axis === 'z' ? next : p.z) - half
    const maxZ = (axis === 'z' ? next : p.z) + half

    if (collidesAt(world, minX, minY, minZ, maxX, maxY, maxZ)) {
      if (axis === 'y') this.onGround = sign < 0
      this.velocity[axis] = 0
      if (sign > 0) {
        const leading = axis === 'x' ? maxX : axis === 'y' ? maxY : maxZ
        p[axis] = Math.floor(leading) - half - REST_EPSILON
      } else {
        const leading = axis === 'x' ? minX : axis === 'y' ? minY : minZ
        p[axis] = Math.floor(leading) + 1 + half + REST_EPSILON
      }
      return
    }

    if (axis === 'y') this.onGround = false
    p[axis] = next
  }

  canPickup(playerPos) {
    if (this.age < PICKUP_DELAY) return false
    const dx = this.position.x - playerPos.x
    const dy = this.position.y - playerPos.y
    const dz = this.position.z - playerPos.z
    return (dx * dx + dy * dy + dz * dz) <= PICKUP_RANGE_SQ
  }
}
