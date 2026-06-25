import * as THREE from 'three'
import { AIR, blocks } from '../blocks/registry.js'

const ARROW_SPEED = 28
const ARROW_GRAVITY = 9
const ARROW_LIFE = 8

function isSolid(world, x, y, z) {
  const id = world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))
  if (id === AIR) return false
  const def = blocks[id]
  return !!(def?.solid && !def?.liquid)
}

class ArrowProjectile {
  constructor(x, y, z, direction) {
    this.position = new THREE.Vector3(x, y, z)
    this.velocity = direction.clone().normalize().multiplyScalar(ARROW_SPEED)
    this.age = 0
    this.dead = false
    this.mesh = this.buildMesh()
    this.syncMesh()
  }

  buildMesh() {
    const group = new THREE.Group()
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 0.72),
      new THREE.MeshLambertMaterial({ color: 0xd8d3bd })
    )
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.18, 6),
      new THREE.MeshLambertMaterial({ color: 0x9a9a9a })
    )
    head.rotation.x = Math.PI / 2
    head.position.z = -0.44
    const fletch = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.02, 0.12),
      new THREE.MeshLambertMaterial({ color: 0xf0f0f0 })
    )
    fletch.position.z = 0.42
    group.add(shaft, head, fletch)
    return group
  }

  syncMesh() {
    if (!this.mesh) return
    this.mesh.position.copy(this.position)
    const dir = this.velocity.clone().normalize()
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir)
  }

  update(dt, world, mobs = []) {
    this.age += dt
    if (this.age > ARROW_LIFE) {
      this.dead = true
      return
    }
    const prev = this.position.clone()
    this.velocity.y -= ARROW_GRAVITY * dt
    this.position.addScaledVector(this.velocity, dt)
    if (isSolid(world, this.position.x, this.position.y, this.position.z)) {
      this.dead = true
      return
    }
    for (const mob of mobs) {
      if (!mob || mob.dead || mob.dying) continue
      const cy = mob.position.y + (mob.height || 1) * 0.5
      const dx = mob.position.x - this.position.x
      const dy = cy - this.position.y
      const dz = mob.position.z - this.position.z
      const hitRadius = (mob.half || 0.35) + 0.2
      if (dx * dx + dy * dy + dz * dz > hitRadius * hitRadius) continue
      mob.damage?.(6, prev.x, prev.z, 'projectile')
      this.dead = true
      return
    }
    this.syncMesh()
  }
}

export class ArrowManager {
  constructor(scene, world) {
    this.scene = scene
    this.world = world
    this.arrows = []
  }

  spawn(x, y, z, direction) {
    const arrow = new ArrowProjectile(x, y, z, direction)
    this.arrows.push(arrow)
    if (arrow.mesh) this.scene.add(arrow.mesh)
    return arrow
  }

  update(dt, mobs = []) {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const arrow = this.arrows[i]
      arrow.update(dt, this.world, mobs)
      if (!arrow.dead) continue
      if (arrow.mesh) this.scene.remove(arrow.mesh)
      this.arrows.splice(i, 1)
    }
  }

  clear() {
    for (const arrow of this.arrows) {
      if (arrow.mesh) this.scene.remove(arrow.mesh)
    }
    this.arrows.length = 0
  }
}
