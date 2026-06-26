import * as THREE from 'three'
import { MobIA } from './MobIA.js'
import { daylightFactor } from '../world/dayNightCycle.js'
import { defineItem, getThingByName } from '../items/itemRegistry.js'
import { loadMobModel, cloneMobScene } from '../models/mobGltf.js'
import { AttackGoal } from './goals.js'
// Vite ?url import — bundler emits the .glb as a static asset and gives us
// the correct hashed URL at runtime. Avoids 404s when the dev server doesn't
// serve files outside the served roots.
import { getVolume } from '../sounds/soundManager.js'
import zombieGlbUrl from '../models/mobs/zombie.glb?url'
import zombieMp3Url from '../sounds/zombie.mp3?url'

const ZOMBIE_GLB_URL = zombieGlbUrl
// Kick off the fetch as soon as this module is imported so the first zombie
// usually swaps to the GLB within a frame or two of spawning.
loadMobModel(ZOMBIE_GLB_URL).catch((err) => console.warn('zombie.glb load failed', err))

const ZOMBIE_SWORD = getThingByName('iron_sword') || defineItem('iron_sword', { label: 'Iron Sword', stackSize: 1, color: [210, 210, 220], category: 'tool', toolKind: 'sword' })

export class Zombie extends MobIA {
  constructor(x, y, z) {
    super(x, y, z)
    this.type = 'zombie'
    this.half = 0.35
    this.height = 1.8
    this.walkSpeed = 1.25
    this.maxHealth = 20
    this.health = this.maxHealth
    this.turnIntervalMin = 1.2
    this.turnIntervalMax = 3.5
    this.idleChance = 0.2
    this.drops = [
      { item: 'mutton', min: 0, max: 1 },
      { item: 'iron_sword', min: 0, max: 1, chance: 0.1 }
    ]
    this.lootSword = Math.random() < 0.01
    this.sunBurnTimer = 0
    this.attackCooldown = 0
    this.playedRushSound = false
    this.goalSelector.addGoal(new AttackGoal(this, {
      priority: 5,
      radius: 16,
      attackRange: 1.5,
      speed: 1.6,
      baseSpeed: 1.25,
      attack: (mob, target) => mob.attackTarget(target),
      onEngage: (mob, context) => mob.playZombieRushSound(context.playerPos)
    }))
    this.buildMesh()
  }

  buildMesh() {
    // Outer group is what the rest of the engine references via this.mesh.
    // Children are swapped (placeholder cubes → GLB scene) without changing
    // the wrapper, so position/rotation logic in MobIA stays intact.
    const group = new THREE.Group()
    const placeholder = this.buildPlaceholderMesh()
    group.add(placeholder)
    this.mesh = group
    this.placeholderMesh = placeholder
    this.gltfMesh = null

    loadMobModel(ZOMBIE_GLB_URL).then((gltf) => {
      if (!this.mesh) return // disposed before load finished
      const scene = cloneMobScene(gltf)
      // Normalize to ~1.8 unit tall (zombie height) regardless of source
      // export scale; auto-fit using bounding box.
      const box = new THREE.Box3().setFromObject(scene)
      const size = new THREE.Vector3(); box.getSize(size)
      const sourceHeight = size.y || 1
      const s = this.height / sourceHeight
      scene.scale.setScalar(s)
      // Re-measure after scale and re-ground so feet sit at y=0 of the group
      // (same convention as the placeholder cubes).
      box.setFromObject(scene)
      scene.position.y -= box.min.y
      this.gltfMesh = scene
      group.remove(placeholder)
      placeholder.traverse((c) => {
        if (c.geometry) c.geometry.dispose()
        if (c.material) c.material.dispose()
      })
      this.placeholderMesh = null
      group.add(scene)
    }).catch(() => {
      // GLB load already warned at module level; placeholder stays in place.
    })

    this.syncMesh()
    return group
  }

  buildPlaceholderMesh() {
    const group = new THREE.Group()
    const skin = new THREE.MeshLambertMaterial({ color: 0x6a8b4c })
    const shirt = new THREE.MeshLambertMaterial({ color: 0x3a5f88 })
    const pants = new THREE.MeshLambertMaterial({ color: 0x2f3d55 })
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.72), skin)
    head.position.y = 1.56
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.05, 0.45), shirt)
    body.position.y = 0.9
    const armGeo = new THREE.BoxGeometry(0.22, 0.98, 0.22)
    const armL = new THREE.Mesh(armGeo, shirt)
    const armR = new THREE.Mesh(armGeo, shirt)
    armL.position.set(-0.5, 0.95, 0)
    armR.position.set(0.5, 0.95, 0)
    const legGeo = new THREE.BoxGeometry(0.25, 0.95, 0.25)
    const legL = new THREE.Mesh(legGeo, pants)
    const legR = new THREE.Mesh(legGeo, pants)
    legL.position.set(-0.18, 0.12, 0)
    legR.position.set(0.18, 0.12, 0)
    group.add(head, body, armL, armR, legL, legR)
    return group
  }

  updateSunBurn(dt, world) {
    if (!world) return
    const timeOfDay = world.timeOfDay == null ? 0 : world.timeOfDay
    const daylight = daylightFactor(timeOfDay)
    const isDay = daylight > 0.2
    if (isDay) {
      this.sunBurnTimer += dt
      this.setBurning(3)
    } else {
      this.sunBurnTimer = 0
      this.extinguish()
    }
  }

  attackTarget(player) {
    if (!player || !player.health || this.attackCooldown > 0) return
    if (player.health.invincible) return

    player.health.damage(3) // Deal 1.5 hearts of damage
    const dx = player.position.x - this.position.x
    const dz = player.position.z - this.position.z
    const len = Math.hypot(dx, dz) || 1
    player.velocity.x += (dx / len) * 1.8
    player.velocity.y = Math.max(player.velocity.y, 2.2)
    player.velocity.z += (dz / len) * 1.8
    this.attackCooldown = 1.0
  }

  playZombieRushSound(playerPos) {
    if (this.playedRushSound) return
    if (!playerPos) return
    const dx = playerPos.x - this.position.x
    const dy = playerPos.y - this.position.y
    const dz = playerPos.z - this.position.z
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (dist > 10) return  // Too far — no sound
    this.playedRushSound = true
    try {
      const audio = new Audio(zombieMp3Url)
      // Volume falls off linearly with distance (1.0 at 0 blocks, 0 at 10 blocks)
      audio.volume = Math.max(0.05, 0.7 * (1 - dist / 10)) * getVolume('effects')
      audio.play().catch(() => {})
    } catch (e) {}
  }

  update(dt, world, playerPos, scene, player = null) {
    if (this.attackCooldown > 0) this.attackCooldown = Math.max(0, this.attackCooldown - dt)
    this.updateSunBurn(dt, world)
    super.update(dt, world, playerPos, scene, player)
  }

  resolveDrop(entry) {
    if (entry.item === 'iron_sword') return this.lootSword && Math.random() < 0.1
    return true
  }
}
