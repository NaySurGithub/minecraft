import * as THREE from 'three'
import { AIR, blocks } from '../blocks/registry.js'

const TERMINAL_VELOCITY = 30

export function blockAt(world, x, y, z) {
  const id = world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))
  if (id === AIR) return null
  return blocks[id] || null
}

export function isSolidAt(world, x, y, z) {
  const b = blockAt(world, x, y, z)
  return !!(b && b.solid)
}

export class Entity {
  constructor(x, y, z) {
    this.position = new THREE.Vector3(x, y, z)
    this.velocity = new THREE.Vector3(0, 0, 0)
    this.yaw = 0
    this.half = 0.4
    this.height = 1.0
    this.onGround = false
    this.age = 0
    this.dead = false
    this.mesh = null
    this.burning = false
    this.burnTimer = 0
    this.burnTickTimer = 0
    this.burnDamage = 1
  }

  _nextBurnInterval() {
    return 0.5
  }

  setBurning(seconds) {
    this.burning = true
    this.burnTimer = Math.max(this.burnTimer, seconds)
    if (this.burnTickTimer <= 0) this.burnTickTimer = this._nextBurnInterval()
  }

  extinguish() {
    this.burning = false
    this.burnTimer = 0
    this.burnTickTimer = 0
  }

  applyBurnDamage() {
    this.damage(this.burnDamage)
  }

  updateBurning(dt) {
    if (!this.burning) return
    this.burnTimer -= dt
    if (this.burnTimer <= 0) {
      this.burning = false
      this.burnTickTimer = 0
      return
    }
    this.burnTickTimer -= dt
    if (this.burnTickTimer <= 0) {
      this.applyBurnDamage()
      this.burnTickTimer = this._nextBurnInterval()
    }
  }

  burnFor(seconds) {
    this.setBurning(seconds)
  }

  intersectsWorld(world, px, py, pz) {
    const h = this.half
    const minX = Math.floor(px - h)
    const maxX = Math.floor(px + h)
    const minY = Math.floor(py)
    const maxY = Math.floor(py + this.height)
    const minZ = Math.floor(pz - h)
    const maxZ = Math.floor(pz + h)
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (isSolidAt(world, x, y, z)) return true
        }
      }
    }
    return false
  }

  moveAxis(world, axis, amount) {
    if (amount === 0) return false
    const next = this.position.clone()
    next[axis] += amount
    if (!this.intersectsWorld(world, next.x, next.y, next.z)) {
      this.position[axis] = next[axis]
      return false
    }
    if (axis === 'y') {
      if (amount < 0) this.onGround = true
      this.velocity.y = 0
    }
    return true
  }

  applyGravity(dt, gravity) {
    this.velocity.y -= gravity * dt
    if (this.velocity.y < -TERMINAL_VELOCITY) this.velocity.y = -TERMINAL_VELOCITY
  }

  buildMesh() {
    return null
  }

  syncMesh() {
    if (!this.mesh) return
    this.mesh.position.set(this.position.x, this.position.y, this.position.z)
    this.mesh.rotation.y = this.yaw
  }

  serialize() {
    return {
      type: this.type,
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      yaw: this.yaw,
      age: this.age
    }
  }

  update(dt, world) {
    this.age += dt
  }
}
