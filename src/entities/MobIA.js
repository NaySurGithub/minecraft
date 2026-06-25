import * as THREE from 'three'
import { Entity } from './Entity.js'
import { GRAVITY } from '../config/constants.js'
import { AIR, blocks } from '../blocks/registry.js'
import { sounds } from '../sounds/soundManager.js'
import { GoalSelector, WanderGoal } from './goals.js'

const DEATH_FALL_DURATION = 0.4
const DEATH_PARTICLE_DURATION = 1.2
const DEATH_PARTICLE_COUNT = 14
const DEATH_FALL_ANGLE = Math.PI / 2

const MOB_AIR_MAX = 15
const MOB_AIR_DRAIN_INTERVAL = 1.0
const MOB_AIR_REGEN_INTERVAL = 0.4
const MOB_DROWN_INTERVAL = 1.0
const MOB_DROWN_DAMAGE = 2
const MOB_SUFFOCATION_INTERVAL = 0.5
const MOB_SUFFOCATION_DAMAGE = 1
const FIRE_PANIC_SEARCH_RADIUS = 10
const FIRE_PANIC_SPEED_MULT = 1.9

export class MobIA extends Entity {
  constructor(x, y, z) {
    super(x, y, z)
    this.walkSpeed = 1.6
    this.jumpVelocity = 7.5
    this.stepHeight = 1.0
    this.maxHealth = 10
    this.health = this.maxHealth
    this.turnIntervalMin = 2.5
    this.turnIntervalMax = 6.0
    this.idleChance = 0.35
    this.moving = false
    this.decisionTimer = 0
    this.knockback = { x: 0, z: 0, timer: 0 }
    this.hurtTimer = 0
    this._hurtTintActive = false
    this.onHurt = null
    this.onDeath = null
    this.dying = false
    this.deathPhase = null
    this.deathTimer = 0
    this.deathParticles = []
    this.air = MOB_AIR_MAX
    this.airDrainTimer = 0
    this.airRegenTimer = 0
    this.drownTimer = 0
    this.suffocationTimer = 0
    this.firePanic = false
    this.firePanicTarget = null
    this.firePanicRescanTimer = 0
    this.goalSelector = new GoalSelector(this)
    this.goalSelector.addGoal(new WanderGoal(this, 100))
    this._pickNewGoal()
  }

  _pickNewGoal() {
    this.decisionTimer = this.turnIntervalMin + Math.random() * (this.turnIntervalMax - this.turnIntervalMin)
    if (Math.random() < this.idleChance) {
      this.moving = false
    } else {
      this.moving = true
      this.yaw = Math.random() * Math.PI * 2
    }
  }

  _tryStepUp(world, dx, dz) {
    const up = this.position.clone()
    up.y += this.stepHeight
    if (this.intersectsWorld(world, up.x, up.y, up.z)) return false
    const stepped = up.clone()
    stepped.x += dx
    stepped.z += dz
    if (this.intersectsWorld(world, stepped.x, stepped.y, stepped.z)) return false
    this.position.copy(stepped)
    return true
  }

  _setHurtTint(active) {
    if (active === this._hurtTintActive || !this.mesh) return
    this._hurtTintActive = active
    this.mesh.traverse((child) => {
      if (!child.isMesh || !child.material) return
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const mat of mats) {
        if (!mat.emissive) continue
        if (active) {
          if (!mat.userData._origEmissive) {
            mat.userData._origEmissive = mat.emissive.clone()
            mat.userData._origEmissiveIntensity = mat.emissiveIntensity ?? 1
          }
          mat.emissive.setRGB(1, 0, 0)
          mat.emissiveIntensity = 0.6
        } else if (mat.userData._origEmissive) {
          mat.emissive.copy(mat.userData._origEmissive)
          mat.emissiveIntensity = mat.userData._origEmissiveIntensity
        }
      }
    })
  }

  applyKnockback(dirX, dirZ, strength, vertical) {
    const len = Math.hypot(dirX, dirZ) || 1
    this.knockback.x = (dirX / len) * strength
    this.knockback.z = (dirZ / len) * strength
    this.knockback.timer = 0.3
    if (this.onGround) this.velocity.y = vertical == null ? 5 : vertical
  }

  damage(amount, fromX, fromZ) {
    if (this.dying) return false
    this.health -= amount
    sounds.playHurt()
    this.hurtTimer = 0.25
    if (fromX != null && fromZ != null) {
      this.applyKnockback(this.position.x - fromX, this.position.z - fromZ, 2.2, 2.6)
    }
    if (this.onHurt) this.onHurt(this)
    if (this.health <= 0) {
      this.dying = true
      this.deathPhase = 'falling'
      this.deathTimer = 0
      this._setHurtTint(false)
      if (this.onDeath) this.onDeath(this)
      return true
    }
    return false
  }

  _spawnDeathParticles(scene) {
    for (let i = 0; i < DEATH_PARTICLE_COUNT; i++) {
      const size = 0.08 + Math.random() * 0.06
      const geo = new THREE.BoxGeometry(size, size, size)
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(
        this.position.x + (Math.random() - 0.5) * this.half * 2,
        this.position.y + this.height * 0.5,
        this.position.z + (Math.random() - 0.5) * this.half * 2
      )
      const particle = {
        mesh,
        vx: (Math.random() - 0.5) * 0.4,
        vy: 0.5 + Math.random() * 0.5,
        vz: (Math.random() - 0.5) * 0.4,
        life: 0,
        maxLife: DEATH_PARTICLE_DURATION * (0.6 + Math.random() * 0.4)
      }
      this.deathParticles.push(particle)
      if (scene) scene.add(mesh)
    }
  }

  _disposeParticle(particle, scene) {
    if (scene) scene.remove(particle.mesh)
    particle.mesh.geometry.dispose()
    particle.mesh.material.dispose()
  }

  updateDying(dt, scene) {
    this.deathTimer += dt
    if (this.deathPhase === 'falling') {
      const t = Math.min(this.deathTimer / DEATH_FALL_DURATION, 1)
      const eased = 1 - (1 - t) * (1 - t)
      if (this.mesh) this.mesh.rotation.z = DEATH_FALL_ANGLE * eased
      if (t >= 1) {
        this._spawnDeathParticles(scene)
        this.deathPhase = 'particles'
        this.deathTimer = 0
      }
    } else if (this.deathPhase === 'particles') {
      for (let i = this.deathParticles.length - 1; i >= 0; i--) {
        const p = this.deathParticles[i]
        p.life += dt
        p.mesh.position.x += p.vx * dt
        p.mesh.position.y += p.vy * dt
        p.mesh.position.z += p.vz * dt
        p.vy = Math.max(0, p.vy - 0.6 * dt)
        const frac = p.life / p.maxLife
        p.mesh.material.opacity = Math.max(0, 1 - frac)
        if (p.life >= p.maxLife) {
          this._disposeParticle(p, scene)
          this.deathParticles.splice(i, 1)
        }
      }
      if (this.deathParticles.length === 0) {
        this.dead = true
      }
    }
  }

  cleanupDeath(scene) {
    for (const p of this.deathParticles) this._disposeParticle(p, scene)
    this.deathParticles.length = 0
  }

  _isWaterAt(world, x, y, z) {
    const id = world.getBlock(x, y, z)
    if (id === AIR) return false
    return blocks[id]?.name === 'water'
  }

  _findNearestWater(world, radius) {
    const ox = Math.floor(this.position.x)
    const oy = Math.floor(this.position.y)
    const oz = Math.floor(this.position.z)
    let best = null
    let bestDist = Infinity
    for (let r = 1; r <= radius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dy = -r; dy <= 2; dy++) {
            const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz)
            if (Math.max(ax, ay, az) !== r) continue
            const x = ox + dx, y = oy + dy, z = oz + dz
            if (!this._isWaterAt(world, x, y, z)) continue
            const d = dx * dx + dy * dy + dz * dz
            if (d < bestDist) {
              bestDist = d
              best = { x: x + 0.5, y, z: z + 0.5 }
            }
          }
        }
      }
      if (best) return best
    }
    return null
  }

  _updateFirePanic(dt, world) {
    if (!this.burning) {
      if (this.firePanic) {
        this.firePanic = false
        this.firePanicTarget = null
        this.firePanicRescanTimer = 0
      }
      return
    }
    this.firePanicRescanTimer -= dt
    if (!this.firePanicTarget || this.firePanicRescanTimer <= 0) {
      this.firePanicTarget = this._findNearestWater(world, FIRE_PANIC_SEARCH_RADIUS)
      this.firePanicRescanTimer = 0.6
    }
    if (this.firePanicTarget) {
      this.firePanic = true
      const dx = this.firePanicTarget.x - this.position.x
      const dz = this.firePanicTarget.z - this.position.z
      this.yaw = Math.atan2(-dx, -dz)
      this.moving = true
      this.decisionTimer = 0.4
    }
  }

  _updateMobAir(dt, world) {
    const headX = Math.floor(this.position.x)
    const headY = Math.floor(this.position.y + this.height - 0.1)
    const headZ = Math.floor(this.position.z)
    const headId = world.getBlock(headX, headY, headZ)
    const headDef = headId !== AIR ? blocks[headId] : null
    const headSubmerged = headDef?.name === 'water'
    // Suffocation: head inside solid opaque block
    const headInBlock = !!(headDef && headDef.solid && !headDef.transparent && headDef.name !== 'water' && headDef.name !== 'lava')
    if (headInBlock) {
      this.suffocationTimer += dt
      if (this.suffocationTimer >= MOB_SUFFOCATION_INTERVAL) {
        this.suffocationTimer -= MOB_SUFFOCATION_INTERVAL
        this.damage(MOB_SUFFOCATION_DAMAGE)
      }
    } else {
      this.suffocationTimer = 0
    }
    if (headSubmerged) {
      this.airRegenTimer = 0
      this.airDrainTimer += dt
      if (this.airDrainTimer >= MOB_AIR_DRAIN_INTERVAL) {
        this.airDrainTimer = 0
        if (this.air > 0) this.air -= 1
      }
      if (this.air <= 0) {
        this.drownTimer += dt
        if (this.drownTimer >= MOB_DROWN_INTERVAL) {
          this.drownTimer = 0
          this.damage(MOB_DROWN_DAMAGE)
        }
      }
    } else {
      this.airDrainTimer = 0
      this.drownTimer = 0
      this.airRegenTimer += dt
      if (this.airRegenTimer >= MOB_AIR_REGEN_INTERVAL) {
        this.airRegenTimer = 0
        if (this.air < MOB_AIR_MAX) this.air += 1
      }
    }
  }

  update(dt, world, playerPos, scene, player = null) {
    this.age += dt
    if (this.dying) {
      this.updateDying(dt, scene)
      this.syncMesh()
      return
    }
    const here = world?.getBlock(Math.floor(this.position.x), Math.floor(this.position.y + 0.1), Math.floor(this.position.z))
    if (here !== AIR && blocks[here]?.liquid) {
      if (blocks[here]?.name === 'lava') this.setBurning(4)
      else this.extinguish()
    }
    this.updateBurning(dt)
    if (world) this._updateMobAir(dt, world)
    if (world) this._updateFirePanic(dt, world)
    if (this.hurtTimer > 0) this.hurtTimer = Math.max(0, this.hurtTimer - dt)
    this._setHurtTint(this.hurtTimer > 0)

    if (!this.firePanic && this.goalSelector) {
      this.goalSelector.tick(dt, { world, playerPos, scene, player })
    }

    const speed = this.firePanic ? this.walkSpeed * FIRE_PANIC_SPEED_MULT : this.walkSpeed
    let wishX = 0
    let wishZ = 0
    if (this.moving) {
      wishX = -Math.sin(this.yaw) * speed
      wishZ = -Math.cos(this.yaw) * speed
    }

    if (this.knockback.timer > 0) {
      this.knockback.timer = Math.max(0, this.knockback.timer - dt)
      wishX = this.knockback.x
      wishZ = this.knockback.z
    }

    this.applyGravity(dt, GRAVITY)

    const prevOnGround = this.onGround
    this.onGround = false
    this.moveAxis(world, 'y', this.velocity.y * dt)

    const moveX = wishX * dt
    const moveZ = wishZ * dt
    const blockedX = this.moveAxis(world, 'x', moveX)
    const blockedZ = this.moveAxis(world, 'z', moveZ)

    if ((blockedX || blockedZ) && this.moving && this.knockback.timer <= 0) {
      const grounded = this.onGround || prevOnGround
      const stepped = grounded
        ? this._tryStepUp(world, blockedX ? moveX : 0, blockedZ ? moveZ : 0)
        : false
      if (!stepped) {
        if (grounded && Math.random() < 0.5) {
          this.velocity.y = this.jumpVelocity
        } else {
          this.yaw = Math.random() * Math.PI * 2
        }
      }
    }

    this.syncMesh()
  }
}
