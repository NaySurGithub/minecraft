const { createNoise2D, createNoise3D } = require('simplex-noise')

const CHUNK_SIZE = 16
const CHUNK_HEIGHT = 128
const WORLD_MIN_Y = 0
const WORLD_MAX_Y = CHUNK_HEIGHT
const SEA_LEVEL = 48

function xfnv1a(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return function () {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function makeRng(seed) { return xfnv1a(String(seed)) }
function hashSeed(seed) { const rng = makeRng(seed); return Math.floor(rng() * 2147483647) }
function fbm2(noise, x, y, octaves, lacunarity, gain) {
  let amp = 1, freq = 1, sum = 0, norm = 0
  for (let i = 0; i < octaves; i++) { sum += amp * noise(x * freq, y * freq); norm += amp; amp *= gain; freq *= lacunarity }
  return sum / norm
}
function fbm3(noise, x, y, z, octaves, lacunarity, gain) {
  let amp = 1, freq = 1, sum = 0, norm = 0
  for (let i = 0; i < octaves; i++) { sum += amp * noise(x * freq, y * freq, z * freq); norm += amp; amp *= gain; freq *= lacunarity }
  return sum / norm
}
class NoiseField {
  constructor(seed) {
    const base = hashSeed(seed)
    this.height = createNoise2D(makeRng(base + 1))
    this.temperature = createNoise2D(makeRng(base + 2))
    this.humidity = createNoise2D(makeRng(base + 3))
    this.detail = createNoise2D(makeRng(base + 4))
    this.cave = createNoise3D(makeRng(base + 5))
    this.ore = createNoise3D(makeRng(base + 6))
  }
  heightAt(x, z) { return fbm2(this.height, x * 0.006, z * 0.006, 5, 2, 0.5) }
  detailAt(x, z) { return fbm2(this.detail, x * 0.04, z * 0.04, 3, 2, 0.5) }
  temperatureAt(x, z) { return (fbm2(this.temperature, x * 0.0018, z * 0.0018, 3, 2, 0.5) + 1) * 0.5 }
  humidityAt(x, z) { return (fbm2(this.humidity, x * 0.0022, z * 0.0022, 3, 2, 0.5) + 1) * 0.5 }
  caveAt(x, y, z) { return fbm3(this.cave, x * 0.05, y * 0.05, z * 0.05, 3, 2, 0.5) }
  oreAt(x, y, z) { return this.ore(x * 0.1, y * 0.1, z * 0.1) }
}
class TerrainGenerator {
  constructor(seed) { this.seed = seed; this.noise = new NoiseField(seed); this.seedHash = hashSeed(seed) }
  hashAt(worldX, worldZ, salt = 0) { const rng = makeRng(this.seedHash + ':' + worldX + ':' + worldZ + ':' + salt); return rng() }
  biomeAt(worldX, worldZ) {
    const t = this.noise.temperatureAt(worldX, worldZ)
    const h = this.noise.humidityAt(worldX, worldZ)
    if (t > 0.66 && h < 0.33) return 'desert'
    if (t < 0.3) return 'snow'
    if (h > 0.66 && t > 0.4) return 'swamp'
    if (t > 0.55 && h > 0.4) return 'forest'
    if (t > 0.7) return 'mountains'
    return 'plains'
  }
  heightAt(worldX, worldZ) {
    let sum = 0, count = 0
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const wx = worldX + dx, wz = worldZ + dz
      const noise = this.noise.heightAt(wx, wz)
      const biome = this.biomeAt(wx, wz)
      const base = SEA_LEVEL + 4
      const height = biome === 'mountains' ? base + 16 + noise * 40
        : biome === 'desert' ? base + 2 + noise * 10
        : biome === 'swamp' ? SEA_LEVEL - 1 + noise * 4
        : biome === 'forest' ? base + 2 + noise * 12
        : biome === 'snow' ? base + 6 + noise * 18
        : base + noise * 10
      sum += height; count++
    }
    return Math.floor(sum / count)
  }
  generateColumn(worldX, worldZ) { return this.heightAt(worldX, worldZ) }
}
module.exports = { CHUNK_SIZE, CHUNK_HEIGHT, WORLD_MIN_Y, WORLD_MAX_Y, SEA_LEVEL, NoiseField, TerrainGenerator, makeRng, hashSeed }
