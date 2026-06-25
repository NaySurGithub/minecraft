import * as THREE from 'three'

const DAY_TICKS = 24000

const DAY_SKY = new THREE.Color(0x87ceeb)
const NIGHT_SKY = new THREE.Color(0x0a0e1a)
const DAY_FOG = new THREE.Color(0x87ceeb)
const NIGHT_FOG = new THREE.Color(0x0a0e1a)

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function daylightFactor(ticks) {
  const t = ((ticks % DAY_TICKS) + DAY_TICKS) % DAY_TICKS
  if (t < 12000) return 1
  if (t < 14000) return 1 - smoothstep(12000, 14000, t)
  if (t < 22000) return 0
  return smoothstep(22000, 24000, t)
}

export class DayNightCycle {
  constructor(scene, renderer) {
    this.scene = scene
    this.renderer = renderer
    this.ambient = new THREE.AmbientLight(0xffffff, 1)
    this.sun = new THREE.DirectionalLight(0xffffff, 1)
    this.sun.position.set(0.5, 1, 0.3)
    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffee88 })
    )
    this.moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xdfe8ff })
    )
    this.sunMesh.frustumCulled = false
    this.moonMesh.frustumCulled = false
    scene.add(this.ambient)
    scene.add(this.sun)
    scene.add(this.sunMesh)
    scene.add(this.moonMesh)
    this._sky = new THREE.Color()
    this._fog = new THREE.Color()
    this.dimension = null
    this.weather = 'clear'
    this.nightVision = false
  }

  setDimension(dimension = null) {
    this.dimension = dimension
  }

  setWeather(weather = 'clear') {
    this.weather = String(weather || 'clear')
  }

  setNightVision(enabled) {
    this.nightVision = !!enabled
  }

  update(ticks) {
    if (this.dimension?.name === 'nether') {
      this.sunMesh.visible = false
      this.moonMesh.visible = false
      this.ambient.intensity = this.nightVision ? 1.0 : (this.dimension.ambient ?? 0.18)
      this.sun.intensity = this.nightVision ? 0.0 : (this.dimension.sun ?? 0.35)
      this._sky.set(this.dimension.skyColor ?? 0x2a0d14)
      this._fog.set(this.dimension.fogColor ?? 0x3c1016)
      if (this.scene.fog) this.scene.fog.color.copy(this._fog)
      if (this.renderer) this.renderer.setClearColor(this._sky)
      return this._sky
    }
    const f = daylightFactor(ticks)
    const storm = this.weather === 'storm' || this.weather === 'thunder'
    const raining = storm || this.weather === 'rain'
    const weatherDim = storm ? 0.42 : raining ? 0.68 : 1
    const angle = ((ticks % DAY_TICKS) / DAY_TICKS) * Math.PI * 2
    const sunX = Math.cos(angle)
    const sunY = Math.max(0.15, Math.sin(angle))
    this.sun.position.set(sunX, sunY, 0.3)
    if (this.sunMesh) this.sunMesh.position.set(sunX * 90, sunY * 90, -120)
    if (this.sunMesh) this.sunMesh.visible = f > 0.05
    if (this.moonMesh) {
      const moonPhase = 1 - f
      const moonX = -sunX
      const moonY = Math.max(0.15, -Math.sin(angle))
      this.moonMesh.position.set(moonX * 92, moonY * 92, -120)
      this.moonMesh.visible = moonPhase > 0.05
    }
    // Keep global ambient very dim so vertex colors dominate underground.
    this.ambient.intensity = this.nightVision ? 1.0 : (0.05 + 0.10 * f) * weatherDim
    // Outdoor faces already carry high sky-light vertex colors, so the sun
    // can stay comparatively strong without washing out caves.
    this.sun.intensity = this.nightVision ? 0.0 : (0.25 + 1.0 * f) * weatherDim
    this._sky.copy(NIGHT_SKY).lerp(DAY_SKY, f)
    this._fog.copy(NIGHT_FOG).lerp(DAY_FOG, f)
    if (raining) {
      const weatherSky = storm ? new THREE.Color(0x343842) : new THREE.Color(0x66727d)
      const weatherFog = storm ? new THREE.Color(0x2c3038) : new THREE.Color(0x5f6c75)
      this._sky.lerp(weatherSky, storm ? 0.55 : 0.35)
      this._fog.lerp(weatherFog, storm ? 0.6 : 0.4)
    }
    if (this.scene.fog) this.scene.fog.color.copy(this._fog)
    if (this.renderer) this.renderer.setClearColor(this._sky)
    return this._sky
  }

  dispose() {
    this.scene.remove(this.ambient)
    this.scene.remove(this.sun)
    if (this.sunMesh) this.scene.remove(this.sunMesh)
    if (this.moonMesh) this.scene.remove(this.moonMesh)
  }
}
