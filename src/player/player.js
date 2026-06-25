import * as THREE from 'three'
import {
  GRAVITY, JUMP_VELOCITY, PLAYER_SPEED, PLAYER_SPRINT,
  PLAYER_HEIGHT, PLAYER_WIDTH, PLAYER_EYE, CHUNK_HEIGHT
} from '../config/constants.js'
import { AIR, blocks } from '../blocks/registry.js'
import { Entity } from '../entities/Entity.js'

const WATER_GRAVITY_SCALE = 0.35
const WATER_BUOYANCY = 6
const WATER_MAX_FALL = 3
const WATER_SWIM_UP = 4.5
const WATER_DRAG = 0.85

function blockAt(world, x, y, z) {
  const id = world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))
  if (id === AIR) return null
  return blocks[id] || null
}

function isSolidAt(world, x, y, z) {
  const b = blockAt(world, x, y, z)
  return !!(b && b.solid)
}

export class Player extends Entity {
  constructor(world, camera) {
    super(0, CHUNK_HEIGHT, 0)
    this.world = world
    this.camera = camera
    this.pitch = 0
    this.half = PLAYER_WIDTH / 2
    this.height = PLAYER_HEIGHT
    this.flying = false
    this.sprint = false
    this.sneaking = false
    this.fallStartY = this.position.y
    this.wasOnGround = true
    this.onLand = null
    this.inWater = false
    this.headInWater = false
    this.headInBlock = false
    this.health = null
    this.effectsManager = null  // injected from main.js after creation
    this.gamemode = null         // injected from main.js after creation
  }

  applyBurnDamage() {
    if (this.health) this.health.damage(this.burnDamage)
  }

  spawnAtSurface() {
    const x = 0
    const z = 0
    if (typeof this.world.ensureChunk === 'function') {
      this.world.ensureChunk(0, 0)
    }
    for (let y = CHUNK_HEIGHT - 1; y > 0; y--) {
      if (isSolidAt(this.world, x + 0.5, y, z + 0.5)) {
        this.position.set(x + 0.5, y + 1.2, z + 0.5)
        this.velocity.set(0, 0, 0)
        this.fallStartY = this.position.y
        this.wasOnGround = true
        return
      }
    }
    this.position.set(x + 0.5, CHUNK_HEIGHT * 0.6, z + 0.5)
    this.fallStartY = this.position.y
  }

  intersectsWorld(px, py, pz) {
    const h = this.half
    const minX = Math.floor(px - h)
    const maxX = Math.floor(px + h)
    const minY = Math.floor(py)
    const maxY = Math.floor(py + PLAYER_HEIGHT)
    const minZ = Math.floor(pz - h)
    const maxZ = Math.floor(pz + h)
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const id = this.world.getBlock(x, y, z)
          if (id === AIR) continue
          const b = blocks[id]
          if (b && b.solid) return true
        }
      }
    }
    return false
  }

  // True if there is at least one solid block directly beneath the player's
  // horizontal footprint, sampled just below the feet. Used for sneak ledge
  // detection so the player can't walk off an edge while sneaking.
  hasGroundBeneath(px, pz) {
    const h = this.half
    const y = Math.floor(this.position.y - 0.05)
    const minX = Math.floor(px - h)
    const maxX = Math.floor(px + h)
    const minZ = Math.floor(pz - h)
    const maxZ = Math.floor(pz + h)
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const id = this.world.getBlock(x, y, z)
        if (id === AIR) continue
        const b = blocks[id]
        if (b && b.solid) return true
      }
    }
    return false
  }

  moveAxis(axis, amount) {
    // Spectator noclip: skip all collision, just move freely
    if (this.gamemode && !this.gamemode.hasCollision()) {
      this.position[axis] += amount
      return false
    }
    const next = this.position.clone()
    next[axis] += amount
    if (!this.intersectsWorld(next.x, next.y, next.z)) {
      // Sneak ledge guard: if moving horizontally while sneaking and grounded
      // would leave no ground beneath the footprint, block that axis of motion.
      if ((axis === 'x' || axis === 'z') && this.sneaking && this.onGround && !this.inWater && !this.flying) {
        if (!this.hasGroundBeneath(next.x, next.z)) {
          return true
        }
      }
      this.position[axis] = next[axis]
      return false
    }
    if (axis === 'y') {
      if (amount < 0) this.onGround = true
      this.velocity.y = 0
    }
    return true
  }

  sampleFluids() {
    const px = this.position.x
    const py = this.position.y
    const pz = this.position.z
    const feetBlock = blockAt(this.world, px, py + 0.1, pz)
    const headBlock = blockAt(this.world, px, py + PLAYER_EYE, pz)
    this.inWater = feetBlock?.name === 'water'
    this.headInWater = headBlock?.name === 'water'
    if (feetBlock?.name === 'lava' || headBlock?.name === 'lava') this.setBurning(4)
    this.onLadder = false
    // Suffocation: head inside a solid opaque block
    const headId = this.world.getBlock(Math.floor(px), Math.floor(py + PLAYER_EYE), Math.floor(pz))
    const headDef = headId ? blocks[headId] : null
    this.headInBlock = !!(headDef && headDef.solid && !headDef.transparent && headDef.name !== 'water' && headDef.name !== 'lava')
  }

  update(dt, input) {
    // Spectator mode: always fly, ignore fluids/burning
    if (this.gamemode && this.gamemode.isSpectator()) {
      this.flying = true
      const speed = (input.sprint ? PLAYER_SPRINT : PLAYER_SPEED) * 2.0
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
      const wish = new THREE.Vector3()
      if (input.forward) wish.add(forward)
      if (input.back) wish.sub(forward)
      if (input.right) wish.add(right)
      if (input.left) wish.sub(right)
      if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed)
      this.velocity.x = wish.x
      this.velocity.z = wish.z
      this.velocity.y = 0
      if (input.jump) this.velocity.y = speed
      if (input.sneak) this.velocity.y = -speed
      this.moveAxis('y', this.velocity.y * dt)
      this.moveAxis('x', this.velocity.x * dt)
      this.moveAxis('z', this.velocity.z * dt)
      this.camera.position.set(this.position.x, this.position.y + PLAYER_EYE, this.position.z)
      this.camera.rotation.order = 'YXZ'
      this.camera.rotation.y = this.yaw
      this.camera.rotation.x = this.pitch
      return
    }
    this.sampleFluids()
    if (this.inWater) this.extinguish()
    this.updateBurning(dt)

    let speed = input.sprint ? PLAYER_SPRINT : PLAYER_SPEED
    if (this.flying) {
      speed *= 2.0
    }
    // Apply status effects (Speed / Slowness)
    if (this.effectsManager) {
      speed *= this.effectsManager.getSpeedMult()
    }
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
    const wish = new THREE.Vector3()
    if (input.forward) wish.add(forward)
    if (input.back) wish.sub(forward)
    if (input.right) wish.add(right)
    if (input.left) wish.sub(right)
    // Sneak engages on the ground only — flying uses `sneak` to descend, and
    // swimming has its own vertical handling. Sneaking slows movement to ~30%.
    this.sneaking = !!input.sneak && this.onGround && !this.flying && !this.inWater
    const sneakScale = this.sneaking ? 0.3 : 1
    const moveSpeed = (this.inWater && !this.flying ? speed * 0.5 : speed) * sneakScale
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(moveSpeed)

    if (this.flying) {
      this.velocity.x = wish.x
      this.velocity.z = wish.z
      this.velocity.y = 0
      if (input.jump) this.velocity.y = speed
      if (input.sneak) this.velocity.y = -speed
    } else if (this.inWater) {
      this.velocity.x = wish.x
      this.velocity.z = wish.z
      this.velocity.y -= GRAVITY * WATER_GRAVITY_SCALE * dt
      this.velocity.y += WATER_BUOYANCY * dt
      if (input.jump) this.velocity.y = Math.max(this.velocity.y, WATER_SWIM_UP)
      if (this.velocity.y < -WATER_MAX_FALL) this.velocity.y = -WATER_MAX_FALL
      this.velocity.y *= WATER_DRAG
    } else {
      this.velocity.x = wish.x
      this.velocity.z = wish.z
      if (this.onLadder) {
        this.velocity.y = 0
        if (input.jump) this.velocity.y = 3.2
        if (input.sneak) this.velocity.y = -3.2
      } else {
        this.velocity.y -= GRAVITY * dt
      }
      if (input.jump && this.onGround) {
        const jumpMult = this.effectsManager ? this.effectsManager.getJumpMult() : 1
        this.velocity.y = JUMP_VELOCITY * jumpMult
        this.onGround = false
      }
    }

    const prevOnGround = this.onGround
    this.onGround = false
    this.moveAxis('y', this.velocity.y * dt)
    this.moveAxis('x', this.velocity.x * dt)
    this.moveAxis('z', this.velocity.z * dt)

    // Fall tracking: while airborne and rising or holding, refresh fallStartY at apex
    if (!this.onGround) {
      if (this.position.y > this.fallStartY) this.fallStartY = this.position.y
    }

    // Landing transition: was airborne, now on ground
    if (!prevOnGround && this.onGround && !this.wasOnGround) {
      const distance = Math.max(0, this.fallStartY - this.position.y)
      if (this.onLand && !this.inWater) this.onLand(distance)
      this.fallStartY = this.position.y
    }

    // Entering water cancels fall damage
    if (this.inWater) {
      this.fallStartY = this.position.y
    }

    this.wasOnGround = this.onGround

    this.camera.position.set(this.position.x, this.position.y + PLAYER_EYE, this.position.z)
    this.camera.rotation.order = 'YXZ'
    this.camera.rotation.y = this.yaw
    this.camera.rotation.x = this.pitch
  }

  getEye() {
    return new THREE.Vector3(this.position.x, this.position.y + PLAYER_EYE, this.position.z)
  }

  getForward() {
    const dir = new THREE.Vector3(0, 0, -1)
    dir.applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'))
    return dir.normalize()
  }
}
