import * as THREE from 'three'
import { MobIA } from './MobIA.js'
import { applyMobDefaults } from './mobDefaults.js'
import { loadMobModel, cloneMobScene } from '../models/mobGltf.js'
import { DefendVillageGoal } from './goals.js'
// Vite ?url import — bundler emits the .glb as a hashed static asset URL.
import ironGolemGlbUrl from '../models/mobs/iron_golem.glb?url'

const IRON_GOLEM_GLB_URL = ironGolemGlbUrl
// Kick off the fetch as soon as this module is imported so the first golem
// usually swaps to the GLB within a frame or two of spawning.
loadMobModel(IRON_GOLEM_GLB_URL).catch((err) => console.warn('iron_golem.glb load failed', err))

export class Golem extends MobIA {
  constructor(x, y, z) {
    super(x, y, z)
    this.type = 'golem'
    applyMobDefaults(this, this.type)
    this.jumpVelocity = 6
    this.turnIntervalMin = 1.2
    this.turnIntervalMax = 2.8
    this.idleChance = 0.15
    this.angry = false
    this.targetPos = null
    this.attackCooldown = 0
    this.drops = [{ item: 'raw_iron', min: 3, max: 5 }]
    this.goalSelector.addGoal(new DefendVillageGoal(this, {
      priority: 5,
      radius: 16,
      attackRange: 4.2,
      speed: 1.9,
      baseSpeed: 1.9,
      canAttack: (mob, context) => mob.angry || mob._shouldHunt(context.playerPos),
      attack: (mob, target) => mob.attackTarget(target)
    }))
    this.buildMesh()
  }

  buildMesh() {
    // Outer group is what the rest of the engine references via this.mesh.
    // Children are swapped (placeholder cubes -> GLB scene) without changing
    // the wrapper, so position/rotation logic in MobIA stays intact.
    const group = new THREE.Group()
    const placeholder = this.buildPlaceholderMesh()
    group.add(placeholder)
    this.mesh = group
    this.placeholderMesh = placeholder
    this.gltfMesh = null

    loadMobModel(IRON_GOLEM_GLB_URL).then((gltf) => {
      if (!this.mesh) return
      const scene = cloneMobScene(gltf)
      // Normalize to this.height units tall regardless of source export scale.
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
    const stone = new THREE.MeshLambertMaterial({ color: 0xc6c0b5 })
    const moss = new THREE.MeshLambertMaterial({ color: 0x7b9b54 })
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.0), stone)
    head.position.y = 2.45
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.8, 0.9), stone)
    body.position.y = 1.35
    const armGeo = new THREE.BoxGeometry(0.42, 1.65, 0.42)
    const armL = new THREE.Mesh(armGeo, stone)
    const armR = new THREE.Mesh(armGeo, stone)
    armL.position.set(-0.92, 1.3, 0)
    armR.position.set(0.92, 1.3, 0)
    const legGeo = new THREE.BoxGeometry(0.45, 1.1, 0.45)
    const legL = new THREE.Mesh(legGeo, stone)
    const legR = new THREE.Mesh(legGeo, stone)
    legL.position.set(-0.38, 0.35, 0)
    legR.position.set(0.38, 0.35, 0)
    const vine1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.8, 0.08), moss)
    vine1.position.set(-0.58, 1.35, 0.48)
    const vine2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.08), moss)
    vine2.position.set(0.66, 1.15, -0.42)
    group.add(head, body, armL, armR, legL, legR, vine1, vine2)
    return group
  }

  becomeAngry(target = null) {
    this.angry = true
    this.targetPos = target
    this.idleChance = 0
    this.turnIntervalMin = 0.15
    this.turnIntervalMax = 0.45
  }

  damage(amount, fromX, fromZ) {
    const result = super.damage(amount, fromX, fromZ)
    if (amount > 0) this.becomeAngry({ x: fromX, z: fromZ })
    return result
  }

  attackTarget(player) {
    if (!player || !player.health || this.attackCooldown > 0) return
    player.health.damage(21)
    const dx = player.position.x - this.position.x
    const dz = player.position.z - this.position.z
    const len = Math.hypot(dx, dz) || 1
    player.velocity.x += (dx / len) * 1.9
    player.velocity.y = Math.max(player.velocity.y, 2.4)
    player.velocity.z += (dz / len) * 1.9
    this.attackCooldown = 1.2
  }

  update(dt, world, playerPos, scene, player = null) {
    if (this.attackCooldown > 0) this.attackCooldown = Math.max(0, this.attackCooldown - dt)
    super.update(dt, world, playerPos, scene, player)
  }

  _shouldHunt(playerPos) {
    if (!playerPos) return false
    if (this.targetPos) return true
    return false
  }
}
