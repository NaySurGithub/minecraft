import * as THREE from 'three'

const STAGES = 10
const TEX_SIZE = 64

function makeStageTexture(stage) {
  const c = document.createElement('canvas')
  c.width = TEX_SIZE
  c.height = TEX_SIZE
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE)
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'

  let seed = stage * 9301 + 49297
  const rand = () => {
    seed = (seed * 233280 + 12345) & 0x7fffffff
    return (seed % 233280) / 233280
  }

  const crackCount = (stage + 1) * 2
  for (let i = 0; i < crackCount; i++) {
    let x = rand() * TEX_SIZE
    let y = rand() * TEX_SIZE
    ctx.beginPath()
    ctx.moveTo(x, y)
    const segs = 2 + Math.floor(rand() * 3)
    for (let s = 0; s < segs; s++) {
      x += (rand() - 0.5) * TEX_SIZE * 0.5
      y += (rand() - 0.5) * TEX_SIZE * 0.5
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(c)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.needsUpdate = true
  return tex
}

export class BreakOverlay {
  constructor(scene) {
    this.scene = scene
    this.materials = []
    for (let s = 0; s < STAGES; s++) {
      this.materials.push(new THREE.MeshBasicMaterial({
        map: makeStageTexture(s),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      }))
    }
    this.mesh = null
    this.currentStage = -1
  }

  ensureMesh() {
    if (this.mesh) return
    const geo = new THREE.BoxGeometry(1.002, 1.002, 1.002)
    this.mesh = new THREE.Mesh(geo, this.materials[0])
    this.mesh.renderOrder = 999
    this.mesh.visible = false
    this.scene.add(this.mesh)
  }

  update(ratio, target) {
    if (!target || ratio <= 0) {
      this.hide()
      return
    }
    this.ensureMesh()
    let stage = Math.floor(ratio * STAGES)
    if (stage > STAGES - 1) stage = STAGES - 1
    if (stage < 0) stage = 0
    if (stage !== this.currentStage) {
      this.mesh.material = this.materials[stage]
      this.currentStage = stage
    }
    this.mesh.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5)
    this.mesh.visible = true
  }

  hide() {
    if (this.mesh) this.mesh.visible = false
    this.currentStage = -1
  }
}
