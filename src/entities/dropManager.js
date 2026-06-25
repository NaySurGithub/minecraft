import * as THREE from 'three'
import { DropEntity } from './dropEntity.js'
import { blocks, AIR } from '../blocks/registry.js'
import { getThing, isItemId } from '../items/itemRegistry.js'

const ITEM_SIZE = 0.25
const BOB_AMPLITUDE = 0.08
const BOB_SPEED = 2.5
const SPIN_SPEED = 1.2
const DESPAWN_AGE = 300

function buildItemGeometry(atlas, blockId) {
  const geo = new THREE.BoxGeometry(ITEM_SIZE, ITEM_SIZE, ITEM_SIZE)
  const uvAttr = geo.attributes.uv
  const tiles = atlas.faceTiles(blockId)
  const top = atlas.tileUV(tiles ? tiles.top : 0)
  const bottom = atlas.tileUV(tiles ? tiles.bottom : 0)
  const side = atlas.tileUV(tiles ? tiles.side : 0)

  const faceUV = [side, side, top, bottom, side, side]
  for (let f = 0; f < 6; f++) {
    const uv = faceUV[f]
    const base = f * 4
    uvAttr.setXY(base + 0, uv.u0, uv.v1)
    uvAttr.setXY(base + 1, uv.u1, uv.v1)
    uvAttr.setXY(base + 2, uv.u0, uv.v0)
    uvAttr.setXY(base + 3, uv.u1, uv.v0)
  }
  uvAttr.needsUpdate = true
  return geo
}

function buildFallbackGeometry(def) {
  const geo = new THREE.BoxGeometry(ITEM_SIZE, ITEM_SIZE, ITEM_SIZE)
  const c = def.color || [200, 200, 200]
  const color = new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255)
  const colors = new Float32Array(geo.attributes.position.count * 3)
  for (let i =0; i < colors.length; i += 3) {
    colors[i] = color.r
    colors[i + 1] = color.g
    colors[i + 2] = color.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geo
}

export class DropManager {
  constructor(scene, world, atlas, atlasMaterial, inventory) {
    this.scene = scene
    this.world = world
    this.atlas = atlas
    this.atlasMaterial = atlasMaterial
    this.inventory = inventory
    this.drops = []
    this.nextId = 1
    this.geoCache = new Map()
    this.fallbackMat = new THREE.MeshBasicMaterial({ vertexColors: true })
    this.itemMat = atlas ? new THREE.MeshBasicMaterial({ map: atlas.texture }) : this.fallbackMat
    this.onPickup = null
	this.canPickup = true
  }

  _getGeometry(blockId) {
    if (this.geoCache.has(blockId)) return this.geoCache.get(blockId)
    const def = getThing(blockId)
    if (!def) return null
    let geo
    let useFallback = false
    if (this.atlas && !isItemId(blockId)) {
      try {
        geo = buildItemGeometry(this.atlas, blockId)
      } catch (e) {
        geo = buildFallbackGeometry(def)
        useFallback = true
      }
    } else {
      geo = buildFallbackGeometry(def)
      useFallback = true
    }
    const entry = { geo, useFallback }
    this.geoCache.set(blockId, entry)
    return entry
  }

  spawn(x, y, z, blockId, count, id) {
    if (blockId === AIR) return null
    const thing = getThing(blockId)
    if (!thing) return null
    const drop = new DropEntity(x, y, z, blockId, count || 1)
    drop.id = id || 'drop_' + this.nextId++
    const entry = this._getGeometry(blockId)
    if (entry) {
      const mat = entry.useFallback ? this.fallbackMat : this.itemMat
      drop.mesh = new THREE.Mesh(entry.geo, mat)
      drop.mesh.position.copy(drop.position)
      this.scene.add(drop.mesh)
    }
    this.drops.push(drop)
    return drop
  }

  spawnFromBreak(bx, by, bz, blockId) {
    this.spawn(bx + 0.5, by + 0.25, bz + 0.5, blockId, 1)
  }

  update(dt, playerPos) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]
      d.update(dt, this.world, playerPos)

      if (d.age >= DESPAWN_AGE) {
        d.dead = true
      }

      if (this.canPickup && !d.dead && this.inventory && d.canPickup(playerPos)) {
        const leftover = this.inventory.addItem(d.blockId, d.count)
        if (leftover < d.count) {
          const pickedUp = d.count - leftover
          if (this.onPickup) this.onPickup(d.blockId, pickedUp, d)
          d.count = leftover
          if (leftover <= 0) d.dead = true
        }
      }

      if (d.dead) {
        if (d.mesh) {
          this.scene.remove(d.mesh)
        }
        this.drops.splice(i, 1)
        continue
      }

      if (d.mesh) {
        const bob = Math.sin(d.age * BOB_SPEED) * BOB_AMPLITUDE
        d.mesh.position.set(d.position.x, d.position.y + bob, d.position.z)
        d.mesh.rotation.y = d.age * SPIN_SPEED
      }
    }
  }

  serialize() {
    const out = []
    for (const d of this.drops) {
      if (d.dead) continue
      out.push({
        id: d.id,
        x: d.position.x,
        y: d.position.y,
        z: d.position.z,
        blockId: d.blockId,
        count: d.count,
        age: d.age
      })
    }
    return out
  }

  restore(list) {
    if (!Array.isArray(list)) return
    for (const item of list) {
      if (!item) continue
      const drop = this.spawn(item.x, item.y, item.z, item.blockId, item.count, item.id)
      if (drop && typeof item.age === 'number') drop.age = item.age
    }
  }

  clear() {
    for (const d of this.drops) {
      if (d.mesh) this.scene.remove(d.mesh)
    }
    this.drops.length = 0
  }
}
