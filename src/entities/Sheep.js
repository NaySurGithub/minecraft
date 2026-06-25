import * as THREE from 'three'
import { MobIA } from './MobIA.js'

const BODY_COLOR = 0xece5da
const FACE_COLOR = 0xd9c3a8
const LEG_COLOR = 0xb0a896
const SHEEP_COLORS = [
  ['white', 0xf9f9f9],
  ['orange', 0xf9801d],
  ['magenta', 0xc74ebd],
  ['light_blue', 0x3ab3da],
  ['light_gray', 0xb3b3b3],
  ['gray', 0x4c4c4c],
  ['lime', 0x4cae4f],
  ['yellow', 0xd1b12d],
  ['purple', 0x6648ed],
  ['blue', 0x334cb2],
  ['brown', 0x664228],
  ['green', 0x3ab44c],
  ['red', 0xda4c4c],
  ['black', 0x1c1c1c]
]

export class Sheep extends MobIA {
  constructor(x, y, z) {
    super(x, y, z)
    this.type = 'sheep'
    this.half = 0.45
    this.height = 1.3
    this.walkSpeed = 1.6
    this.jumpVelocity = 7.5
    this.stepHeight = 1.0
    this.maxHealth = 8
    this.health = this.maxHealth
    this.idleChance = 0.35
    this.turnIntervalMin = 2.5
    this.turnIntervalMax = 6.0
    this.sheared = false
    this.burning = false
    const [variant, color] = SHEEP_COLORS[Math.floor(Math.random() * SHEEP_COLORS.length)]
    this.woolVariant = variant
    this.woolColor = color
    this.drops = [{ item: variant + '_wool', min: 1, max: 1 }, { item: 'mutton', min: 1, max: 2 }]
    this.buildMesh()
  }

  resolveDrop(entry) {
    if (entry.item === 'wool' || String(entry.item || '').endsWith('_wool')) return !this.sheared
    if (entry.item === 'mutton') {
      entry.item = this.burning ? 'cooked_mutton' : 'mutton'
      return true
    }
    return true
  }

  serialize() {
    return {
      woolVariant: this.woolVariant,
      woolColor: this.woolColor,
      sheared: this.sheared,
      burning: this.burning
    }
  }

  applyState(data) {
    if (!data) return
    if (data.woolVariant) this.woolVariant = data.woolVariant
    if (data.woolColor) this.woolColor = data.woolColor
    this.sheared = !!data.sheared
    this.burning = !!data.burning
    if (this.mesh) {
      this.mesh.traverse((node) => {
        if (node?.isMesh && node.material) {
          if (node.geometry?.parameters?.height === 0.8) node.material.color.set(this.woolColor || BODY_COLOR)
        }
      })
    }
  }

  buildMesh() {
    const group = new THREE.Group()

    const bodyMat = new THREE.MeshLambertMaterial({ color: this.woolColor || BODY_COLOR })
    const faceMat = new THREE.MeshLambertMaterial({ color: FACE_COLOR })
    const legMat = new THREE.MeshLambertMaterial({ color: LEG_COLOR })

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 1.1), bodyMat)
    body.position.set(0, 0.85, 0)
    group.add(body)

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.45), faceMat)
    head.position.set(0, 0.95, -0.75)
    group.add(head)

    const legGeo = new THREE.BoxGeometry(0.22, 0.5, 0.22)
    const legOffsets = [
      [0.28, 0.25, 0.35],
      [-0.28, 0.25, 0.35],
      [0.28, 0.25, -0.35],
      [-0.28, 0.25, -0.35]
    ]
    for (const [lx, ly, lz] of legOffsets) {
      const leg = new THREE.Mesh(legGeo, legMat)
      leg.position.set(lx, ly, lz)
      group.add(leg)
    }

    this.mesh = group
    this.syncMesh()
    return group
  }
}
