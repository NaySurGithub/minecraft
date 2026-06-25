import * as THREE from 'three'
import { MobIA } from './MobIA.js'
import { loadMobModel, cloneMobScene } from '../models/mobGltf.js'
// Vite ?url import — bundler emits the .glb as a hashed static asset URL.
import villagerGlbUrl from '../models/mobs/villager.glb?url'

const VILLAGER_GLB_URL = villagerGlbUrl
// Kick off the fetch as soon as this module is imported so the first villager
// usually swaps to the GLB within a frame or two of spawning.
loadMobModel(VILLAGER_GLB_URL).catch((err) => console.warn('villager.glb load failed', err))

export class Villager extends MobIA {
  constructor(x, y, z) {
    super(x, y, z)
    this.type = 'villager'
    this.half = 0.34
    this.height = 1.7
    this.walkSpeed = 1.05
    this.maxHealth = 10
    this.health = this.maxHealth
    this.turnIntervalMin = 2
    this.turnIntervalMax = 5
    this.idleChance = 0.55
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

    loadMobModel(VILLAGER_GLB_URL).then((gltf) => {
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
      // Source GLB faces the wrong way; flip 180° so it faces forward like
      // the placeholder and matches the yaw the engine assigns.
      scene.rotation.y = Math.PI
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
    const skin = new THREE.MeshLambertMaterial({ color: 0xc98f62 })
    const robe = new THREE.MeshLambertMaterial({ color: 0x5b4131 })
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), skin)
    head.position.y = 1.48
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.0, 0.45), robe)
    body.position.y = 0.85
    const armGeo = new THREE.BoxGeometry(0.22, 0.92, 0.22)
    const armL = new THREE.Mesh(armGeo, robe)
    const armR = new THREE.Mesh(armGeo, robe)
    armL.position.set(-0.48, 0.9, 0)
    armR.position.set(0.48, 0.9, 0)
    const legGeo = new THREE.BoxGeometry(0.24, 0.9, 0.24)
    const legL = new THREE.Mesh(legGeo, robe)
    const legR = new THREE.Mesh(legGeo, robe)
    legL.position.set(-0.18, 0.1, 0)
    legR.position.set(0.18, 0.1, 0)
    group.add(head, body, armL, armR, legL, legR)
    return group
  }
}
