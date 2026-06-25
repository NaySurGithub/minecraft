import * as THREE from 'three'
import { blocks, AIR } from '../blocks/registry.js'

export class FallingBlockSystem {
  constructor(world, scene, atlas, material) {
    this.world = world
    this.scene = scene
    this.atlas = atlas
    this.material = material

    this.blocks = []
  }

  start(wx, wy, wz, id) {
    if (id === AIR) return

    this.world.setBlock(wx, wy, wz, AIR)

    const mesh = this.createMesh(id)

    mesh.position.set(
      wx + 0.5,
      wy + 0.5,
      wz + 0.5
    )

    this.scene.add(mesh)

    this.blocks.push({
      x: wx + 0.5,
      y: wy + 0.5,
      z: wz + 0.5,
      vy: 0,
      id,
      mesh
    })
  }

  update(dt) {
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i]

      b.vy -= 20 * dt
      b.y += b.vy * dt

      b.mesh.position.y = b.y

      const bx = Math.floor(b.x)
      const by = Math.floor(b.y)
      const bz = Math.floor(b.z)

      if (!this.world.isPassable(bx, by - 1, bz)) {

        this.world.setBlock(
          bx,
          by,
          bz,
          b.id
        )

        this.scene.remove(b.mesh)

        if (b.mesh.geometry) b.mesh.geometry.dispose()

        this.blocks.splice(i, 1)
      }
    }
  }

  createMesh(id) {
    // simple cube for now
    const geo = new THREE.BoxGeometry(1, 1, 1)

    const mesh = new THREE.Mesh(
      geo,
      this.material
    )

    return mesh
  }
}