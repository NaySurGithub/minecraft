import { CHUNK_SIZE, CHUNK_HEIGHT } from '../config/constants.js'
import { AIR, blockIds } from '../blocks/registry.js'
import { NoiseField, hashSeed, makeRng } from './noise.js'

export class NetherTerrainGenerator {
  constructor(seed) {
    this.seed = seed
    this.noise = new NoiseField(seed + ':nether')
    this.seedHash = hashSeed(seed + ':nether')
  }

  hashAt(worldX, y, worldZ, salt = 0) {
    const rng = makeRng(`${this.seedHash}:${worldX}:${y}:${worldZ}:${salt}`)
    return rng()
  }

  biomeAt() {
    return 'nether'
  }

  heightAt() {
    return 64
  }

  generate(chunk) {
    const ox = chunk.cx * CHUNK_SIZE
    const oz = chunk.cz * CHUNK_SIZE
    const netherrack = blockIds.NETHERRACK || blockIds.STONE
    const lava = blockIds.LAVA
    const bedrock = blockIds.BEDROCK

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const worldX = ox + x
        const worldZ = oz + z
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let id = netherrack
          if (y <= 1 || y >= CHUNK_HEIGHT - 2) {
            id = bedrock
          } else {
            const broad = this.noise.heightAt(worldX * 0.35, worldZ * 0.35)
            const cave = this.noise.caveAt(worldX * 0.9, y * 1.35, worldZ * 0.9)
            const ceiling = 106 + Math.floor(broad * 10)
            const floor = 18 + Math.floor(this.noise.heightAt(worldX * 0.55 + 77, worldZ * 0.55 - 33) * 6)
            if (y < floor || y > ceiling) {
              id = netherrack
            } else if (cave > 0.55 && y > 6 && y < CHUNK_HEIGHT - 6) {
              id = y < 28 ? lava : AIR
            }
          }
          chunk.set(x, y, z, id)
        }
        if (this.hashAt(worldX >> 3, 90, worldZ >> 3, 2) < 0.035) {
          const gy = 84 + Math.floor(this.hashAt(worldX, 91, worldZ, 3) * 28)
          for (let dy = 0; dy < 3; dy++) {
            if (gy - dy > 2 && gy - dy < CHUNK_HEIGHT - 2 && chunk.get(x, gy - dy, z) === AIR) {
              chunk.set(x, gy - dy, z, lava)
              break
            }
          }
        }
      }
    }

    chunk.generated = true
    chunk.dirty = true
  }
}
