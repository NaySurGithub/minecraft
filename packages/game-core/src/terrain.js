import { CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL } from './constants.js'
import { NoiseField, makeRng, hashSeed } from './noise.js'

export class TerrainGenerator {
  constructor(seed) {
    this.seed = seed
    this.noise = new NoiseField(seed)
    this.seedHash = hashSeed(seed)
  }
  hashAt(worldX, worldZ, salt = 0) {
    const rng = makeRng(this.seedHash + ':' + worldX + ':' + worldZ + ':' + salt)
    return rng()
  }
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
      sum += height
      count++
    }
    return Math.floor(sum / count)
  }
  generateColumn(worldX, worldZ) {
    return this.heightAt(worldX, worldZ)
  }
}

export { CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL }
