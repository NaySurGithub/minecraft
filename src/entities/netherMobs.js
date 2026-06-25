import * as THREE from 'three'
import { MobIA } from './MobIA.js'
import { AttackGoal } from './goals.js'
import { AIR, blocks } from '../blocks/registry.js'
import { getThing } from '../items/itemRegistry.js'

function box(w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }))
  mesh.position.set(x, y, z)
  return mesh
}

function makeHumanoid(mob, colors = {}) {
  const group = new THREE.Group()
  const skin = colors.skin ?? 0xb8a27a
  const body = colors.body ?? 0x704c2f
  const legs = colors.legs ?? 0x4a3424
  group.add(box(mob.half * 1.7, 0.55, mob.half * 1.5, skin, 0, mob.height - 0.28, 0))
  group.add(box(mob.half * 1.8, mob.height * 0.45, mob.half * 1.15, body, 0, mob.height * 0.48, 0))
  group.add(box(0.16, mob.height * 0.42, 0.16, legs, -mob.half * 0.45, mob.height * 0.14, 0))
  group.add(box(0.16, mob.height * 0.42, 0.16, legs, mob.half * 0.45, mob.height * 0.14, 0))
  return group
}

function makeCubeMob(mob, color, scaleY = 1) {
  const group = new THREE.Group()
  group.add(box(mob.half * 2, mob.height * scaleY, mob.half * 2, color, 0, mob.height * scaleY * 0.5, 0))
  return group
}

function damagePlayer(player, amount, from, knockback = 2) {
  if (!player?.health || player.health.invincible) return
  player.health.damage(amount)
  if (!player.velocity || !from) return
  const dx = player.position.x - from.x
  const dz = player.position.z - from.z
  const len = Math.hypot(dx, dz) || 1
  player.velocity.x += (dx / len) * knockback
  player.velocity.z += (dz / len) * knockback
  player.velocity.y = Math.max(player.velocity.y, 1.4)
}

function hasGoldArmor(player) {
  const inv = player?.inventory || player?.hotbar?.inventory
  if (!inv?.slots) return false
  for (let i = 36; i <= 39; i++) {
    const slot = inv.slots[i]
    const def = slot ? getThing(slot.id) : null
    if (def?.name?.startsWith('golden_')) return true
  }
  return false
}

class SimpleHostileMob extends MobIA {
  constructor(x, y, z, options = {}) {
    super(x, y, z)
    this.type = options.type
    this.half = options.half ?? 0.35
    this.height = options.height ?? 1.8
    this.walkSpeed = options.walkSpeed ?? 1.3
    this.maxHealth = options.health ?? 20
    this.health = this.maxHealth
    this.attackDamage = options.attackDamage ?? 4
    this.attackCooldown = 0
    this.fireImmune = !!options.fireImmune
    this.drops = options.drops || []
    this.goalSelector.addGoal(new AttackGoal(this, {
      priority: 5,
      radius: options.radius ?? 16,
      attackRange: options.attackRange ?? 1.5,
      speed: options.attackSpeed ?? this.walkSpeed * 1.2,
      baseSpeed: this.walkSpeed,
      canAttack: options.canAttack || (() => true),
      attack: (mob, player) => mob.attackTarget(player)
    }))
    this.mesh = options.mesh ? options.mesh(this) : makeHumanoid(this, options.colors)
    this.syncMesh()
  }

  setBurning(seconds) {
    if (this.fireImmune) return
    super.setBurning(seconds)
  }

  attackTarget(player) {
    if (this.attackCooldown > 0) return
    damagePlayer(player, this.attackDamage, this.position)
    if (this.burnsTarget) player?.setBurning?.(4)
    this.attackCooldown = 1.2
  }

  update(dt, world, playerPos, scene, player = null) {
    if (this.attackCooldown > 0) this.attackCooldown = Math.max(0, this.attackCooldown - dt)
    super.update(dt, world, playerPos, scene, player)
  }
}

export class Skeleton extends SimpleHostileMob {
  constructor(x, y, z) {
    super(x, y, z, {
      type: 'skeleton',
      colors: { skin: 0xd8d8d8, body: 0xc7c7c7, legs: 0xa0a0a0 },
      drops: [{ item: 'bone', min: 0, max: 2 }, { item: 'arrow', min: 0, max: 2 }]
    })
    this.rangedCooldown = 0
  }

  update(dt, world, playerPos, scene, player = null) {
    this.rangedCooldown = Math.max(0, this.rangedCooldown - dt)
    if (playerPos && player && this.rangedCooldown <= 0) {
      const dx = playerPos.x - this.position.x
      const dz = playerPos.z - this.position.z
      const distSq = dx * dx + dz * dz
      if (distSq <= 18 * 18 && distSq > 3 * 3) {
        this.yaw = Math.atan2(-dx, -dz)
        damagePlayer(player, 3, this.position, 1.1)
        this.rangedCooldown = 1.8
      }
    }
    super.update(dt, world, playerPos, scene, player)
  }
}

export class Enderman extends MobIA {
  constructor(x, y, z) {
    super(x, y, z)
    this.type = 'enderman'
    this.half = 0.32
    this.height = 2.9
    this.walkSpeed = 1.8
    this.maxHealth = 40
    this.health = this.maxHealth
    this.angry = false
    this.mouthOpenTimer = 0
    this.attackCooldown = 0
    this.teleportCooldown = 0
    this.rainDamageTimer = 0
    this.drops = [{ item: 'ender_pearl', min: 0, max: 1, chance: 0.5 }]
    this.goalSelector.addGoal(new AttackGoal(this, {
      priority: 4,
      radius: 64,
      attackRange: 1.7,
      speed: 2.6,
      baseSpeed: this.walkSpeed,
      canAttack: (mob) => mob.angry,
      attack: (mob, player) => mob.attackTarget(player)
    }))
    this.mesh = this.buildEndermanMesh()
    this.syncMesh()
  }

  buildEndermanMesh() {
    const group = new THREE.Group()
    const black = 0x141018
    const eye = 0xcc55ff
    group.add(box(0.52, 0.55, 0.42, black, 0, 2.62, 0))
    group.add(box(0.12, 0.05, 0.04, eye, -0.1, 2.66, -0.22))
    group.add(box(0.12, 0.05, 0.04, eye, 0.1, 2.66, -0.22))
    group.add(box(0.55, 1.25, 0.32, black, 0, 1.75, 0))
    group.add(box(0.14, 1.55, 0.14, black, -0.42, 1.55, 0))
    group.add(box(0.14, 1.55, 0.14, black, 0.42, 1.55, 0))
    group.add(box(0.16, 1.45, 0.16, black, -0.18, 0.72, 0))
    group.add(box(0.16, 1.45, 0.16, black, 0.18, 0.72, 0))
    this.mouth = box(0.28, 0.04, 0.04, 0x2a0d35, 0, 2.48, -0.23)
    this.mouth.visible = false
    group.add(this.mouth)
    return group
  }

  canSeePlayer(player, world) {
    if (!player?.getEye || !world) return false
    const inv = player.inventory || player.hotbar?.inventory
    const helmet = inv?.slots?.[36]
    if (helmet) {
      const def = getThing(helmet.id)
      if (def?.name === 'pumpkin') return false
    }
    const eye = player.getEye()
    const head = new THREE.Vector3(this.position.x, this.position.y + this.height - 0.25, this.position.z)
    const toHead = head.clone().sub(eye)
    const dist = toHead.length()
    if (dist <= 0.001 || dist > 64) return false
    const dir = toHead.clone().normalize()
    if (dir.dot(player.getForward()) < 0.975) return false
    const steps = Math.floor(dist / 0.5)
    for (let i = 1; i < steps; i++) {
      const p = eye.clone().addScaledVector(dir, i * 0.5)
      const id = world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))
      if (id === AIR) continue
      return false
    }
    return true
  }

  findTeleportSpot(world, radius = 32) {
    for (let i = 0; i < 64; i++) {
      const x = Math.floor(this.position.x + (Math.random() * 2 - 1) * radius)
      const z = Math.floor(this.position.z + (Math.random() * 2 - 1) * radius)
      const startY = Math.min(126, Math.floor(this.position.y + 16 + Math.random() * 16))
      for (let y = startY; y >= 2; y--) {
        if (world.isPassable(x, y, z) && world.isPassable(x, y + 1, z) && world.isPassable(x, y + 2, z) && !world.isPassable(x, y - 1, z)) {
          return { x: x + 0.5, y, z: z + 0.5 }
        }
      }
    }
    return null
  }

  teleport(world, behindPlayer = null) {
    let spot = null
    if (behindPlayer?.getForward) {
      const f = behindPlayer.getForward()
      const bx = behindPlayer.position.x - f.x * 3
      const bz = behindPlayer.position.z - f.z * 3
      const by = Math.floor(behindPlayer.position.y)
      if (world.isPassable(Math.floor(bx), by, Math.floor(bz))) spot = { x: bx, y: by, z: bz }
    }
    if (!spot) spot = this.findTeleportSpot(world)
    if (!spot) return false
    this.position.set(spot.x, spot.y, spot.z)
    this.velocity.set(0, 0, 0)
    this.teleportCooldown = 0.4
    return true
  }

  damage(amount, fromX, fromZ, source = 'melee') {
    if (source === 'projectile') {
      if (this._lastWorld) this.teleport(this._lastWorld)
      return false
    }
    this.angry = true
    this.mouthOpenTimer = 2
    const result = super.damage(amount, fromX, fromZ)
    if (!result && this._lastWorld && Math.random() < 0.85) this.teleport(this._lastWorld, this._lastPlayer)
    return result
  }

  attackTarget(player) {
    if (this.attackCooldown > 0) return
    damagePlayer(player, 7, this.position, 2.4)
    this.attackCooldown = 0.9
  }

  update(dt, world, playerPos, scene, player = null) {
    this._lastWorld = world
    this._lastPlayer = player
    this.attackCooldown = Math.max(0, this.attackCooldown - dt)
    this.teleportCooldown = Math.max(0, this.teleportCooldown - dt)
    this.mouthOpenTimer = Math.max(0, this.mouthOpenTimer - dt)
    if (this.mouth) this.mouth.visible = this.mouthOpenTimer > 0
    if (player && !this.angry && this.canSeePlayer(player, world)) {
      this.angry = true
      this.mouthOpenTimer = 3
    }
    const feet = world?.getBlock(Math.floor(this.position.x), Math.floor(this.position.y + 0.1), Math.floor(this.position.z))
    const inWater = feet !== AIR && blocks[feet]?.name === 'water'
    const raining = world?.dimension !== 'nether' && ['rain', 'storm', 'thunder'].includes(world?.weather)
    if (inWater || raining) {
      this.rainDamageTimer += dt
      if (this.teleportCooldown <= 0) this.teleport(world)
      if (this.rainDamageTimer >= 0.8) {
        this.rainDamageTimer = 0
        super.damage(1)
      }
    }
    super.update(dt, world, playerPos, scene, player)
  }
}

export class ZombiePiglin extends SimpleHostileMob {
  constructor(x, y, z) {
    super(x, y, z, {
      type: 'zombie_piglin',
      colors: { skin: 0xc79a8d, body: 0x5f4b32, legs: 0x6d5a44 },
      attackDamage: 9,
      fireImmune: true,
      canAttack: (mob) => mob.angry,
      drops: [{ item: 'golden_sword', min: 0, max: 1, chance: 0.05 }]
    })
    this.angry = false
  }

  damage(amount, fromX, fromZ, source) {
    this.angry = true
    return super.damage(amount, fromX, fromZ, source)
  }
}

export class Blaze extends SimpleHostileMob {
  constructor(x, y, z) {
    super(x, y, z, {
      type: 'blaze',
      half: 0.38,
      height: 1.8,
      colors: { skin: 0xffc84a, body: 0xff8a24, legs: 0x6b2c18 },
      attackDamage: 5,
      fireImmune: true,
      radius: 18,
      drops: [{ item: 'blaze_rod', min: 0, max: 1, chance: 0.5 }]
    })
    this.burnsTarget = true
  }
}

export class MagmaCube extends SimpleHostileMob {
  constructor(x, y, z) {
    super(x, y, z, {
      type: 'magma_cube',
      half: 0.45,
      height: 0.9,
      mesh: (mob) => makeCubeMob(mob, 0x7b261d),
      attackDamage: 4,
      fireImmune: true,
      drops: [{ item: 'magma_cream', min: 0, max: 1, chance: 0.35 }]
    })
  }
}

export class WitherSkeleton extends SimpleHostileMob {
  constructor(x, y, z) {
    super(x, y, z, {
      type: 'wither_skeleton',
      height: 2.85,
      colors: { skin: 0x242428, body: 0x18181c, legs: 0x101014 },
      attackDamage: 8,
      drops: [{ item: 'bone', min: 0, max: 2 }, { item: 'wither_skeleton_skull', min: 1, max: 1, chance: 0.03 }]
    })
  }
}

export class Piglin extends SimpleHostileMob {
  constructor(x, y, z) {
    super(x, y, z, {
      type: 'piglin',
      colors: { skin: 0xd49a75, body: 0x7b3425, legs: 0x5a291f },
      attackDamage: 5,
      canAttack: (mob, context) => mob.angry || !hasGoldArmor(context.player)
    })
    this.angry = false
  }
}

export class PiglinBrute extends SimpleHostileMob {
  constructor(x, y, z) {
    super(x, y, z, {
      type: 'piglin_brute',
      colors: { skin: 0xbd7955, body: 0x3d2018, legs: 0x2b1813 },
      attackDamage: 9,
      attackSpeed: 1.9
    })
  }
}

export class Hoglin extends SimpleHostileMob {
  constructor(x, y, z) {
    super(x, y, z, {
      type: 'hoglin',
      half: 0.55,
      height: 1.35,
      mesh: (mob) => {
        const group = makeCubeMob(mob, 0x9b6b58, 0.8)
        group.add(box(0.18, 0.18, 0.45, 0xf0e0c0, -0.32, 0.88, -0.42))
        group.add(box(0.18, 0.18, 0.45, 0xf0e0c0, 0.32, 0.88, -0.42))
        return group
      },
      attackDamage: 6,
      drops: [{ item: 'porkchop', min: 1, max: 3 }]
    })
  }
}

export class Strider extends MobIA {
  constructor(x, y, z) {
    super(x, y, z)
    this.type = 'strider'
    this.half = 0.42
    this.height = 1.45
    this.walkSpeed = 0.9
    this.maxHealth = 20
    this.health = this.maxHealth
    this.mesh = makeCubeMob(this, 0x9c4561, 0.75)
    this.syncMesh()
  }

  update(dt, world, playerPos, scene, player = null) {
    const below = world?.getBlock(Math.floor(this.position.x), Math.floor(this.position.y - 0.1), Math.floor(this.position.z))
    if (below !== AIR && blocks[below]?.name === 'lava') {
      this.velocity.y = Math.max(this.velocity.y, 0)
      this.onGround = true
    }
    super.update(dt, world, playerPos, scene, player)
  }
}

export class Ghast extends MobIA {
  constructor(x, y, z) {
    super(x, y, z)
    this.type = 'ghast'
    this.half = 1.0
    this.height = 1.4
    this.maxHealth = 10
    this.health = this.maxHealth
    this.attackCooldown = 0
    this.drops = [{ item: 'gunpowder', min: 0, max: 2 }, { item: 'ghast_tear', min: 1, max: 1, chance: 0.25 }]
    this.mesh = this.buildMesh()
    this.syncMesh()
  }

  buildMesh() {
    const group = makeCubeMob(this, 0xe8e2df)
    for (let i = 0; i < 6; i++) {
      const x = (i % 3 - 1) * 0.42
      const z = i < 3 ? -0.3 : 0.3
      group.add(box(0.12, 0.9, 0.12, 0xd6cfcc, x, -0.25, z))
    }
    return group
  }

  setBurning() {}
  applyBurnDamage() {}

  update(dt, world, playerPos, scene, player = null) {
    this.age += dt
    this.attackCooldown = Math.max(0, this.attackCooldown - dt)
    this.position.y += Math.sin(this.age * 1.4) * dt * 0.35
    if (playerPos) {
      const dx = playerPos.x - this.position.x
      const dz = playerPos.z - this.position.z
      const distSq = dx * dx + dz * dz
      if (distSq > 0.001) this.yaw = Math.atan2(-dx, -dz)
      if (distSq <= 28 * 28 && this.attackCooldown <= 0) {
        damagePlayer(player, 6, this.position, 2.6)
        player?.setBurning?.(3)
        this.attackCooldown = 3.0
      }
    }
    this.syncMesh()
  }
}
