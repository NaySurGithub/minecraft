import * as THREE from 'three'
import { Sheep } from './Sheep.js'
import { Villager } from './villager.js'
import { Golem } from './golem.js'
import { Zombie } from './zombie.js'
import { Creeper } from './creeper.js'
import { MobIA } from './MobIA.js'
import { getThingByName, defineSpawnEgg } from '../items/itemRegistry.js'
import { mobDefs, mobDefsByType } from '../../packages/game-core/src/content.js'
import {
  Blaze,
  Enderman,
  Ghast,
  Hoglin,
  MagmaCube,
  Piglin,
  PiglinBrute,
  Skeleton,
  Strider,
  WitherSkeleton,
  ZombiePiglin
} from './netherMobs.js'

const MOB_TYPES = {
  sheep: Sheep,
  villager: Villager,
  golem: Golem,
  zombie: Zombie,
  creeper: Creeper,
  skeleton: Skeleton,
  enderman: Enderman,
  ghast: Ghast,
  zombie_piglin: ZombiePiglin,
  blaze: Blaze,
  magma_cube: MagmaCube,
  wither_skeleton: WitherSkeleton,
  piglin: Piglin,
  piglin_brute: PiglinBrute,
  hoglin: Hoglin,
  strider: Strider
}

function colorFrom(value, fallback) {
  const c = value || fallback
  return (c[0] << 16) | (c[1] << 8) | c[2]
}

function makeModMob(def) {
  return class ModMob extends MobIA {
    constructor(x, y, z) {
      super(x, y, z)
      this.type = def.type
      this.half = def.half == null ? 0.4 : def.half
      this.height = def.height == null ? 1.2 : def.height
      this.walkSpeed = def.walkSpeed == null ? 1.4 : def.walkSpeed
      this.maxHealth = def.health == null ? 10 : def.health
      this.health = this.maxHealth
      this.drops = Array.isArray(def.drops) ? def.drops : []
      this.buildMesh()
    }

    buildMesh() {
      const group = new THREE.Group()
      const mat = new THREE.MeshLambertMaterial({ color: colorFrom(def.color, [180, 180, 180]) })
      const body = new THREE.Mesh(new THREE.BoxGeometry(this.half * 2, this.height, this.half * 2), mat)
      body.position.y = this.height / 2
      group.add(body)
      this.mesh = group
      this.syncMesh()
      return group
    }
  }
}

export function defineMob(type, def) {
  if (!type) return false
  MOB_TYPES[type] = makeModMob({ ...def, type })
  defineSpawnEgg(type + '_spawn_egg', {
    label: (def.label || type) + ' Spawn Egg',
    color: def.color || [220, 220, 220],
    spawnMob: type
  })
  return true
}

for (const mob of mobDefs || []) {
  defineSpawnEgg(`${mob.type}_spawn_egg`, {
    label: `${mob.label || mob.type} Spawn Egg`,
    color: mob.spawnEgg || mob.color || [220, 220, 220],
    spawnMob: mob.type
  })
}

export class MobManager {
  constructor(scene, world, dropManager) {
    this.scene = scene
    this.world = world
    this.dropManager = dropManager
    this.mobs = []
    this.nextId = 1
  }

  spawn(type, x, y, z, id) {
    const Ctor = MOB_TYPES[type]
    if (!Ctor) return null
    const mob = new Ctor(x, y, z)
    mob.id = id || 'mob_' + this.nextId++
    const shared = mobDefsByType[type]
    if (shared) {
      if (typeof shared.health === 'number') mob.maxHealth = shared.health
      if (typeof shared.walkSpeed === 'number') mob.walkSpeed = shared.walkSpeed
      if (typeof shared.half === 'number') mob.half = shared.half
      if (typeof shared.height === 'number') mob.height = shared.height
      if (Array.isArray(shared.drops)) mob.drops = shared.drops
      if (Array.isArray(shared.goals)) mob.sharedGoals = shared.goals
      mob.type = shared.type || mob.type
    }
    if (mob.mesh) this.scene.add(mob.mesh)
    mob.onDeath = (m) => this._spawnDrops(m)
    this.mobs.push(mob)
    return mob
  }

  _spawnDrops(mob) {
    if (!this.dropManager || !mob.drops) return
    for (const entry of mob.drops) {
      if (!entry || !entry.item) continue
      if (typeof mob.resolveDrop === 'function' && !mob.resolveDrop(entry)) continue
      if (entry.chance != null && Math.random() > entry.chance) continue
      const min = entry.min == null ? 1 : entry.min
      const max = entry.max == null ? min : entry.max
      const count = min + Math.floor(Math.random() * (max - min + 1))
      if (count <= 0) continue
      const def = getThingByName(entry.item)
      if (!def) continue
      this.dropManager.spawn(mob.position.x, mob.position.y + 0.4, mob.position.z, def.id, count)
    }
  }

  update(dt, playerPos, player = null) {
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i]
      mob.update(dt, this.world, playerPos, this.scene, player)
      if (mob.dead) {
        if (typeof mob.cleanupDeath === 'function') mob.cleanupDeath(this.scene)
        if (mob.mesh) this.scene.remove(mob.mesh)
        this.mobs.splice(i, 1)
        continue
      }
      mob.syncMesh()
    }
  }

  findNearest(type, x, y, z, radius = 8) {
    let best = null
    let bestDist = radius * radius
    for (const mob of this.mobs) {
      if (mob.type !== type || mob.dead) continue
      const dx = mob.position.x - x
      const dy = mob.position.y - y
      const dz = mob.position.z - z
      const d = dx * dx + dy * dy + dz * dz
      if (d < bestDist) {
        best = mob
        bestDist = d
      }
    }
    return best
  }

  angerGolemsNear(x, y, z, radius = 20) {
    const r2 = radius * radius
    for (const mob of this.mobs) {
      if (mob.type !== 'golem' || typeof mob.becomeAngry !== 'function') continue
      const dx = mob.position.x - x
      const dy = mob.position.y - y
      const dz = mob.position.z - z
      if (dx * dx + dy * dy + dz * dz <= r2) mob.becomeAngry({ x, y, z })
    }
  }

  angerMobsNear(type, x, y, z, radius = 24) {
    const r2 = radius * radius
    for (const mob of this.mobs) {
      if (mob.type !== type || mob.dead) continue
      const dx = mob.position.x - x
      const dy = mob.position.y - y
      const dz = mob.position.z - z
      if (dx * dx + dy * dy + dz * dz <= r2) mob.angry = true
    }
  }

  count() {
    return this.mobs.length
  }

  serialize() {
    const out = []
    for (const mob of this.mobs) {
      if (mob.dead) continue
      out.push({
        id: mob.id,
        type: mob.type,
        x: mob.position.x,
        y: mob.position.y,
        z: mob.position.z,
        yaw: mob.yaw,
        health: mob.health,
        age: mob.age,
        state: typeof mob.serialize === 'function' ? mob.serialize() : null
      })
    }
    return out
  }

  restore(list) {
    if (!Array.isArray(list)) return
    for (const data of list) {
      if (!data || !data.type) continue
      const mob = this.spawn(data.type, data.x, data.y, data.z, data.id)
      if (!mob) continue
      if (typeof data.yaw === 'number') mob.yaw = data.yaw
      if (typeof data.health === 'number') mob.health = data.health
      if (typeof data.age === 'number') mob.age = data.age
      if (data.state && typeof mob.applyState === 'function') mob.applyState(data.state)
      mob.syncMesh()
    }
  }

  clear() {
    for (const mob of this.mobs) {
      if (typeof mob.cleanupDeath === 'function') mob.cleanupDeath(this.scene)
      if (mob.mesh) this.scene.remove(mob.mesh)
    }
    this.mobs.length = 0
  }
}
