import * as THREE from 'three'

const RAIN_COUNT = 360
const STORM_COUNT = 520
const AREA = 34
const HEIGHT = 24
const FALL_SPEED = 38

function activeWeather(weather) {
  return weather === 'rain' || weather === 'storm' || weather === 'thunder'
}

export class WeatherParticles {
  constructor(scene) {
    this.scene = scene
    this.weather = 'clear'
    this.count = 0
    this.positions = new Float32Array(STORM_COUNT * 3)
    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.material = new THREE.PointsMaterial({
      color: 0xb8d8ee,
      size: 0.055,
      transparent: true,
      opacity: 0.8,
      depthWrite: false
    })
    this.points = new THREE.Points(this.geometry, this.material)
    this.points.frustumCulled = false
    this.points.visible = false
    this.scene.add(this.points)
  }

  setWeather(weather) {
    const next = String(weather || 'clear')
    if (this.weather === next) return
    this.weather = next
    this.count = next === 'storm' || next === 'thunder' ? STORM_COUNT : activeWeather(next) ? RAIN_COUNT : 0
    this.points.visible = this.count > 0
    this.material.opacity = next === 'storm' || next === 'thunder' ? 0.92 : 0.72
    this.material.size = next === 'storm' || next === 'thunder' ? 0.065 : 0.052
    this.resetAll({ x: 0, y: 80, z: 0 })
  }

  resetDrop(i, origin, randomY = true) {
    const idx = i * 3
    this.positions[idx] = origin.x + (Math.random() - 0.5) * AREA
    this.positions[idx + 1] = origin.y + (randomY ? Math.random() * HEIGHT : HEIGHT)
    this.positions[idx + 2] = origin.z + (Math.random() - 0.5) * AREA
  }

  resetAll(origin) {
    for (let i = 0; i < STORM_COUNT; i++) this.resetDrop(i, origin, true)
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.setDrawRange(0, this.count)
  }

  update(dt, player, dimension = 'overworld') {
    const enabled = this.count > 0 && dimension !== 'nether' && player?.position
    this.points.visible = enabled
    if (!enabled) return

    const origin = player.position
    const fall = FALL_SPEED * dt * (this.weather === 'storm' || this.weather === 'thunder' ? 1.25 : 1)
    for (let i = 0; i < this.count; i++) {
      const idx = i * 3
      this.positions[idx] -= fall * 0.18
      this.positions[idx + 1] -= fall
      if (
        this.positions[idx + 1] < origin.y - 3 ||
        Math.abs(this.positions[idx] - origin.x) > AREA * 0.6 ||
        Math.abs(this.positions[idx + 2] - origin.z) > AREA * 0.6
      ) {
        this.resetDrop(i, origin, false)
      }
    }
    this.geometry.attributes.position.needsUpdate = true
  }

  dispose() {
    if (this.points?.parent) this.points.parent.remove(this.points)
    this.geometry.dispose()
    this.material.dispose()
  }
}
