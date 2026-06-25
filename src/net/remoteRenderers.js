import * as THREE from 'three'
import { blocks } from '../blocks/registry.js'
import { getThing } from '../items/itemRegistry.js'

function removeObject(scene, object) {
  if (!object) return
  scene.remove(object)
  if (object.geometry) object.geometry.dispose()
  if (object.material) object.material.dispose()
}

function makeNameTag(name) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, 8, 256, 40)
  ctx.fillStyle = '#fff'
  ctx.font = '24px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(name || 'Player', 128, 36)
  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(1.8, 0.45, 1)
  sprite.position.y = 2.05
  return sprite
}

function makeRemotePlayer(name) {
  const group = new THREE.Group()
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0x3f73d8 })
  const headMat = new THREE.MeshBasicMaterial({ color: 0xd8b090 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.15, 0.35), bodyMat)
  body.position.y = 0.75
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), headMat)
  head.position.y = 1.55
  const nameTag = makeNameTag(name)
  nameTag.name = 'nametag'
  group.add(body, head, nameTag)
  return group
}

function makeDrop(blockId) {
  const def = blocks[blockId]
  const c = def?.color || [220, 220, 220]
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255) })
  return new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), mat)
}

export class RemoteRenderers {
  constructor(scene) {
    this.scene = scene
    this.players = new Map()
    this.playerSnapshots = []
    this.drops = new Map()
    this.mobs = new Map()
  }

  syncPlayers(players, localId, localPos) {
    const seen = new Set()
    this.playerSnapshots = []
    for (const data of players || []) {
      if (!data || data.id === localId) continue
      // Spectator players are invisible to all other players
      if (data.spectator) continue
      this.playerSnapshots.push({
        id: data.id,
        position: new THREE.Vector3(data.x || 0, data.y || 0, data.z || 0),
        half: 0.3,
        height: 1.8
      })
      seen.add(data.id)
      let mesh = this.players.get(data.id)
      if (!mesh) {
        mesh = makeRemotePlayer(data.name)
        this.players.set(data.id, mesh)
        this.scene.add(mesh)
      }
      mesh.position.set(data.x || 0, data.y || 0, data.z || 0)
      mesh.rotation.y = data.yaw || 0
      this._updatePlayerArmor(mesh, data.armor)

      const nameTag = mesh.getObjectByName('nametag')
      if (nameTag && localPos) {
        const dist = mesh.position.distanceTo(localPos)
        if (dist <= 20) {
          nameTag.material.depthTest = false
          nameTag.renderOrder = 999
        } else {
          nameTag.material.depthTest = true
          nameTag.renderOrder = 0
        }
      }
    }
    for (const [id, mesh] of this.players) {
      if (seen.has(id)) continue
      removeObject(this.scene, mesh)
      this.players.delete(id)
    }
  }

  _updatePlayerArmor(group, armor) {
    const oldArmor = group.getObjectByName('armor')
    if (oldArmor) group.remove(oldArmor)
    if (!armor || !Array.isArray(armor)) return

    const armorGroup = new THREE.Group()
    armorGroup.name = 'armor'

    const getArmorColor = (stack) => {
      if (!stack) return null
      const thing = getThing(stack.id)
      if (!thing) return null
      const name = thing.name || ''
      if (name.includes('leather')) return new THREE.Color(0xa06540)
      if (name.includes('golden')) return new THREE.Color(0xf6ca4a)
      if (name.includes('iron')) return new THREE.Color(0xd2d2dc)
      if (name.includes('diamond')) return new THREE.Color(0x5ae6e6)
      return null
    }

    const helmet = armor[0]
    const chestplate = armor[1]
    const leggings = armor[2]
    const boots = armor[3]

    const createArmorBox = (w, h, d, px, py, pz, color) => {
      const mat = new THREE.MeshBasicMaterial({ color })
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
      mesh.position.set(px, py, pz)
      return mesh
    }

    const hCol = getArmorColor(helmet)
    if (hCol) {
      const hMesh = createArmorBox(0.55, 0.55, 0.55, 0, 1.55, 0, hCol)
      armorGroup.add(hMesh)
    }

    const cCol = getArmorColor(chestplate)
    if (cCol) {
      const cMesh = createArmorBox(0.7, 0.9, 0.4, 0, 0.85, 0, cCol)
      armorGroup.add(cMesh)
    }

    const lCol = getArmorColor(leggings)
    if (lCol) {
      const lMesh = createArmorBox(0.68, 0.5, 0.38, 0, 0.35, 0, lCol)
      armorGroup.add(lMesh)
    }

    const bCol = getArmorColor(boots)
    if (bCol) {
      const bMeshLeft = createArmorBox(0.28, 0.18, 0.38, -0.18, 0.1, 0, bCol)
      const bMeshRight = createArmorBox(0.28, 0.18, 0.38, 0.18, 0.1, 0, bCol)
      armorGroup.add(bMeshLeft, bMeshRight)
    }

    group.add(armorGroup)
  }

  getPlayerColliders() {
    return this.playerSnapshots
  }

  syncDrops(drops) {
    const seen = new Set()
    for (const data of drops || []) {
      if (!data || !data.id) continue
      seen.add(data.id)
      let mesh = this.drops.get(data.id)
      if (!mesh) {
        mesh = makeDrop(data.blockId)
        this.drops.set(data.id, mesh)
        this.scene.add(mesh)
      }
      mesh.position.set(data.x || 0, data.y || 0, data.z || 0)
      mesh.rotation.y = data.age || 0
    }
    for (const [id, mesh] of this.drops) {
      if (seen.has(id)) continue
      removeObject(this.scene, mesh)
      this.drops.delete(id)
    }
  }

  syncMobs(mobs) {
    const seen = new Set()
    for (const data of mobs || []) {
      if (!data || !data.id) continue
      seen.add(data.id)
      let mesh = this.mobs.get(data.id)
      if (!mesh) {
        mesh = this._makeMob(data.type)
        this.mobs.set(data.id, mesh)
        this.scene.add(mesh)
      }
      mesh.position.set(data.x || 0, data.y || 0, data.z || 0)
      mesh.rotation.y = data.yaw || 0
    }
    for (const [id, mesh] of this.mobs) {
      if (seen.has(id)) continue
      removeObject(this.scene, mesh)
      this.mobs.delete(id)
    }
  }

  _makeMob(type) {
    const group = new THREE.Group()
    const bodyMat = new THREE.MeshBasicMaterial({ color: type === 'sheep' ? 0xf0f0e8 : 0x88aa88 })
    const faceMat = new THREE.MeshBasicMaterial({ color: 0x333333 })
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 1.1), bodyMat)
    body.position.y = 0.65
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), faceMat)
    head.position.set(0, 0.85, -0.7)
    group.add(body, head)
    return group
  }

  clear() {
    for (const mesh of this.players.values()) removeObject(this.scene, mesh)
    for (const mesh of this.drops.values()) removeObject(this.scene, mesh)
    for (const mesh of this.mobs.values()) removeObject(this.scene, mesh)
    this.players.clear()
    this.drops.clear()
    this.mobs.clear()
  }
}
