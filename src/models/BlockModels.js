import * as THREE from 'three'
import { blocks, blockIds } from '../blocks/registry.js'
import { getModelGeometry } from './modelRegistry.js'

function colorGeo(geo, color) {
  // BoxGeometry is indexed (24 verts, 36 draw calls). Convert to non-indexed
  // so every draw-call vertex has its own color slot — required by Three.js
  // when vertexColors:true is set on the material.
  const nonIndexed = geo.toNonIndexed()
  geo.dispose()
  const r = color[0] / 255
  const g = color[1] / 255
  const b = color[2] / 255
  const count = nonIndexed.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    colors[i * 3] = r
    colors[i * 3 + 1] = g
    colors[i * 3 + 2] = b
  }
  nonIndexed.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return nonIndexed
}

// Manages per-instance meshes for model-blocks (renderType: 'model').
// The chunk mesher skips these blocks entirely, so each one gets its own
// lightweight Mesh placed at the block's world position. Geometries are shared
// from the model registry and must never be disposed here.
export class BlockModels {
  constructor(scene, world, material) {
    this.scene = scene
    this.world = world
    this.material = material
    this.modelMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      color: 0xffffff,
      side: THREE.DoubleSide
    })
    // key "x,y,z" -> THREE.Mesh
    this.meshes = new Map()
  }

  key(wx, wy, wz) {
    return wx + ',' + wy + ',' + wz
  }

  add(wx, wy, wz, blockId) {
    const def = blocks[blockId]
    if (!def || def.renderType !== 'model') return
    const k = this.key(wx, wy, wz)
    // Replace any existing mesh at this position first.
    this.remove(wx, wy, wz)

    if (def.model === 'chest') {
      const paired = this.world.getPairedChest(wx, wy, wz)
      let isDouble = false
      let isFirst = true
      let local_dx = 0

      if (paired) {
        isDouble = true
        isFirst = (wx < paired.x) || (wx === paired.x && wz < paired.z)
      }

      if (isDouble && !isFirst) {
        return
      }

      const inv = this.world.getChestInventory(wx, wy, wz)
      const facing = inv?.facing || 'south'

      if (isDouble) {
        const dx = paired.x - wx
        const dz = paired.z - wz
        if (facing === 'south') local_dx = dx
        else if (facing === 'north') local_dx = -dx
        else if (facing === 'west') local_dx = dz
        else if (facing === 'east') local_dx = -dz
      }

      const root = new THREE.Group()

      // Rotated sub-group to handle block rotation
      const rotatedGroup = new THREE.Group()
      rotatedGroup.position.set(0.5, 0, 0.5)

      if (facing === 'north') rotatedGroup.rotation.y = Math.PI
      else if (facing === 'west') rotatedGroup.rotation.y = Math.PI / 2
      else if (facing === 'east') rotatedGroup.rotation.y = -Math.PI / 2
      else rotatedGroup.rotation.y = 0

      root.add(rotatedGroup)

      const width = isDouble ? 1.875 : 0.875
      const offset = isDouble ? local_dx * 0.5 : 0.0

      // Geometries for chest base
      const chestColor = def.color || [140, 100, 60]
      const baseGeo = colorGeo(new THREE.BoxGeometry(width, 0.625, 0.875), chestColor)
      const baseMesh = new THREE.Mesh(baseGeo, this.modelMaterial)
      baseMesh.position.set(offset, 0.3125, 0)
      rotatedGroup.add(baseMesh)

      // Lid Group (hinge at back Z = 0.4375, Y = 0.625)
      const lidGroup = new THREE.Group()
      lidGroup.position.set(offset, 0.625, 0.4375)
      rotatedGroup.add(lidGroup)

      // Lid Mesh (local to lid group)
      const lidGeo = colorGeo(new THREE.BoxGeometry(width, 0.25, 0.875), chestColor)
      const lidMesh = new THREE.Mesh(lidGeo, this.modelMaterial)
      lidMesh.position.set(0, 0.125, -0.4375)
      lidGroup.add(lidMesh)

      // Latch Mesh (local to lid group)
      const latchGeo = colorGeo(new THREE.BoxGeometry(0.125, 0.25, 0.0625), def.name === 'ender_chest' ? [140, 220, 255] : [220, 200, 80])
      const latchMesh = new THREE.Mesh(latchGeo, this.modelMaterial)
      latchMesh.position.set(0, 0, -0.90625)
      lidGroup.add(latchMesh)

      root.position.set(wx, wy, wz)
      root.isChest = true
      root.lidGroup = lidGroup

      this.scene.add(root)
      this.meshes.set(k, root)
      return
    }

    const geo = getModelGeometry(def.model)
if (!geo) return

const mesh = new THREE.Mesh(geo, this.modelMaterial)

if (def.model === 'portal' && this.portalAxis(wx, wy, wz) === 'z') {
  mesh.rotation.y = -Math.PI / 2
  mesh.position.set(wx + 1, wy, wz)

} else if (def.name === 'torch') {

  const meta = this.world.getBlockMeta?.(wx, wy, wz)
  const face = meta?.face || 'top'

  const tilt = 0.42
  const shift = 0.20

  mesh.position.set(wx, wy, wz)

  if (face === 'north') {
    mesh.rotation.x = tilt
    mesh.position.set(wx, wy, wz + shift)

  } else if (face === 'south') {
    mesh.rotation.x = -tilt
    mesh.position.set(wx, wy, wz - shift)

  } else if (face === 'east') {
    mesh.rotation.z = tilt
    mesh.position.set(wx - shift, wy, wz)

  } else if (face === 'west') {
    mesh.rotation.z = -tilt
    mesh.position.set(wx + shift, wy, wz)
  }

} else {
  mesh.position.set(wx, wy, wz)
}

mesh.frustumCulled = true
this.scene.add(mesh)
this.meshes.set(k, mesh)
  }

  portalAxis(wx, wy, wz) {
    const portal = blockIds.FIRE_PORTAL
    const frame = blockIds.OBSIDIAN
    const xScore =
      (this.world.getBlock(wx - 1, wy, wz) === portal || this.world.getBlock(wx - 1, wy, wz) === frame ? 1 : 0) +
      (this.world.getBlock(wx + 1, wy, wz) === portal || this.world.getBlock(wx + 1, wy, wz) === frame ? 1 : 0)
    const zScore =
      (this.world.getBlock(wx, wy, wz - 1) === portal || this.world.getBlock(wx, wy, wz - 1) === frame ? 1 : 0) +
      (this.world.getBlock(wx, wy, wz + 1) === portal || this.world.getBlock(wx, wy, wz + 1) === frame ? 1 : 0)
    return zScore > xScore ? 'z' : 'x'
  }

  remove(wx, wy, wz) {
    const k = this.key(wx, wy, wz)
    const mesh = this.meshes.get(k)
    if (!mesh) return
    this.scene.remove(mesh)
    // Geometry is shared via the registry; do not dispose it here.
    this.meshes.delete(k)
  }

  // Reconcile the mesh at a position with the current world block. Call after
  // any place/break. Reads the live voxel: a model-block -> ensure mesh present;
  // anything else (including AIR) -> ensure mesh removed.
  sync(wx, wy, wz, syncNeighbors = true) {
    const id = this.world.getBlock(wx, wy, wz)
    const def = blocks[id]
    if (def && def.renderType === 'model') {
      this.add(wx, wy, wz, id)
    } else {
      this.remove(wx, wy, wz)
    }
    if (syncNeighbors) {
      this.sync(wx + 1, wy, wz, false)
      this.sync(wx - 1, wy, wz, false)
      this.sync(wx, wy, wz + 1, false)
      this.sync(wx, wy, wz - 1, false)
    }
  }

  update(dt) {
    const speed = 7.0
    for (const [key, mesh] of this.meshes.entries()) {
      if (mesh.isChest) {
        const parts = key.split(',')
        const wx = parseInt(parts[0], 10)
        const wy = parseInt(parts[1], 10)
        const wz = parseInt(parts[2], 10)
        const inv = this.world.getChestInventory(wx, wy, wz)
        const targetRot = (inv && inv.isOpen) ? -1.3 : 0.0

        const lid = mesh.lidGroup
        if (lid) {
          if (lid.rotation.x < targetRot) {
            lid.rotation.x = Math.min(targetRot, lid.rotation.x + speed * dt)
          } else if (lid.rotation.x > targetRot) {
            lid.rotation.x = Math.max(targetRot, lid.rotation.x - speed * dt)
          }
        }
      }
    }
  }

  clear() {
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh)
    }
    this.meshes.clear()
  }
}
