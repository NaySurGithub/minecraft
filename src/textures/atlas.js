import * as THREE from 'three'
import { TEXTURE_SIZE, ATLAS_COLS } from '../config/constants.js'
import { blocks } from '../blocks/registry.js'
import { generators } from './patterns.js'
import { DEBUG_TEXTURES, debugLog, debugOnce } from '../debug/debug.js'

const TEXTURES = {
  missing: { pattern: 'solid', color: [255, 0, 255] },
  stone: { pattern: 'noise', color: [122, 122, 128] },
  cobblestone: { pattern: 'cobble', color: [110, 110, 116] },
  dirt: { pattern: 'noise', color: [134, 96, 67] },
  grass_top: { pattern: 'grass', color: [96, 160, 72] },
  grass_side: { pattern: 'grass', color: [110, 150, 80] },
  sand: { pattern: 'noise', color: [219, 205, 154] },
  gravel: { pattern: 'cobble', color: [136, 126, 120] },
  bedrock: { pattern: 'cobble', color: [60, 60, 64] },
  log_top: { pattern: 'log', color: [150, 116, 72] },
  log_side: { pattern: 'log', color: [108, 84, 52] },
  oak_planks: { pattern: 'planks', color: [160, 128, 78] },
  oak_leaves: { pattern: 'leaves', color: [70, 124, 56] },
  water: { pattern: 'water', color: [60, 110, 200] },
  lava: { pattern: 'lava', color: [235, 110, 20] },
  fire: { pattern: 'pumpkin', color: [255, 160, 40] },
  sponge: { pattern: 'noise', color: [202, 186, 94] },
  wet_sponge: { pattern: 'noise', color: [118, 146, 94] },
  crafting_top: { pattern: 'crafting_top', color: [160, 128, 78] },
  crafting_side: { pattern: 'crafting_side', color: [160, 128, 78] },
  wool: { pattern: 'wool', color: [236, 236, 236] },
  bed: { pattern: 'planks', color: [210, 60, 60] },
  iron_block: { pattern: 'shiny', color: [211, 211, 214] },
  coal_block: { pattern: 'shiny', color: [45, 45, 45] },
  copper_block: { pattern: 'shiny', color: [210, 126, 82] },
  gold_block: { pattern: 'shiny', color: [246, 202, 74] },
  diamond_block: { pattern: 'shiny', color: [90, 230, 230] },
  lapis_block: { pattern: 'shiny', color: [58, 86, 210] },
  emerald_block: { pattern: 'shiny', color: [70, 220, 110] },
  redstone_block: { pattern: 'shiny', color: [210, 42, 42] },
  pumpkin: { pattern: 'pumpkin', color: [220, 120, 30] },
  piston: { pattern: 'piston', color: [140, 120, 95] },
  lever: { pattern: 'lever', color: [120, 100, 75] },
  glass: { pattern: 'glass', color: [200, 240, 255] },
  chest: { pattern: 'chest_side', color: [140, 100, 60] },
  chest_front: { pattern: 'chest', color: [140, 100, 60] },
  chest_side: { pattern: 'chest_side', color: [140, 100, 60] }
}

function oreTexture(block) {
  if (!block?.name?.endsWith('_ore')) return null
  return { pattern: 'ore', color: block.color || [150, 150, 150] }
}

function textureKeyFor(block, face) {
  if (!block) return 'missing'
  if (block.faces && block.faces[face]) return block.faces[face]
  if (block.texture) return block.texture
  if (block.name === 'grass') {
    if (face === 'top') return 'grass_top'
    if (face === 'bottom') return 'dirt'
    return 'grass_side'
  }
  if (block.name === 'oak_log') return face === 'side' ? 'log_side' : 'log_top'
  return block.name
}

function textureFor(block, face) {
  const key = textureKeyFor(block, face)
  const ore = oreTexture(block)
  const texture = TEXTURES[key] || ore || {
    pattern: block?.pattern || 'solid',
    color: block?.color || [128, 128, 128]
  }
  return { key, pattern: texture.pattern, color: texture.color }
}

function copyTile(source, target, atlasWidth, offsetX, offsetY, tileSize) {
  for (let y = 0; y < tileSize; y++) {
    for (let x = 0; x < tileSize; x++) {
      const src = (y * tileSize + x) * 4
      const dst = ((offsetY + y) * atlasWidth + (offsetX + x)) * 4
      target[dst] = source[src]
      target[dst + 1] = source[src + 1]
      target[dst + 2] = source[src + 2]
      target[dst + 3] = source[src + 3]
    }
  }
}

class TextureAtlas {
  constructor() {
    this.cols = ATLAS_COLS
    this.rows = 1
    this.tileCount = 0
    this.tiles = []
    this.tileByKey = new Map()
    this.blockFaces = new Map()
    this.texture = null
  }

  addTexture(texture) {
    const cacheKey = `${texture.key}:${texture.pattern}:${texture.color.join(',')}`
    if (this.tileByKey.has(cacheKey)) return this.tileByKey.get(cacheKey)
    const index = this.tiles.length
    this.tiles.push({ ...texture, index })
    this.tileByKey.set(cacheKey, index)
    return index
  }

  addBlock(block) {
    const top = this.addTexture(textureFor(block, 'top'))
    const bottom = this.addTexture(textureFor(block, 'bottom'))
    const side = this.addTexture(textureFor(block, 'side'))
    this.blockFaces.set(block.id, { top, bottom, side })
  }

  build() {
    this.tiles = []
    this.tileByKey.clear()
    this.blockFaces.clear()

    for (const block of blocks) {
      if (!block || block.name === 'air') continue
      this.addBlock(block)
    }

    if (DEBUG_TEXTURES) {
      debugLog('atlas', 'block face tile map', blocks.filter((block) => block && block.name !== 'air').map((block) => ({
        id: block.id,
        name: block.name,
        faces: this.blockFaces.get(block.id),
        keys: {
          top: textureFor(block, 'top').key,
          bottom: textureFor(block, 'bottom').key,
          side: textureFor(block, 'side').key
        }
      })))
      debugLog('atlas', 'unique generated tiles', this.tiles.map((tile) => ({
        index: tile.index,
        key: tile.key,
        pattern: tile.pattern,
        color: tile.color
      })))
    }

    const size = TEXTURE_SIZE
    this.tileCount = this.tiles.length
    this.rows = Math.max(1, Math.ceil(this.tileCount / this.cols))
    const width = this.cols * size
    const height = this.rows * size
    const data = new Uint8Array(width * height * 4)

    for (const tile of this.tiles) {
      const generator = generators[tile.pattern] || generators.solid
      const pixels = generator(size, tile.color, tile.key)
      const col = tile.index % this.cols
      const row = Math.floor(tile.index / this.cols)
      copyTile(pixels, data, width, col * size, row * size, size)
    }

    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat)
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    texture.generateMipmaps = false
    texture.flipY = false
    texture.needsUpdate = true
    texture.colorSpace = THREE.SRGBColorSpace

    this.texture = texture
    if (DEBUG_TEXTURES) {
      debugLog('atlas', 'texture built', {
        width,
        height,
        tileSize: size,
        cols: this.cols,
        rows: this.rows,
        tileCount: this.tileCount,
        colorSpace: texture.colorSpace,
        flipY: texture.flipY
      })
    }
    return this
  }

  tileUV(tileIndex) {
    const index = Number.isFinite(tileIndex) ? tileIndex : 0
    const col = index % this.cols
    const row = Math.floor(index / this.cols)
    const insetU = 0.5 / (this.cols * TEXTURE_SIZE)
    const insetV = 0.5 / (this.rows * TEXTURE_SIZE)
    const u0 = col / this.cols + insetU
    const u1 = (col + 1) / this.cols - insetU
    const v0 = 1 - (row + 1) / this.rows + insetV
    const v1 = 1 - row / this.rows - insetV
    const uv = { u0, v0, u1, v1 }
    if (DEBUG_TEXTURES && (index === 0 || index === 2 || index === 3 || index === 4 || index === 30 || index === 32)) {
      debugOnce(`atlas-uv-${index}`, 'atlas', `uv for tile ${index}`, uv)
    }
    return uv
  }

  faceTiles(blockId) {
    return this.blockFaces.get(blockId) || this.blockFaces.values().next().value || { top: 0, bottom: 0, side: 0 }
  }
}

export function buildAtlas() {
  return new TextureAtlas().build()
}
