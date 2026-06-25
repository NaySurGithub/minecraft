// Per-item icon canvas factory.
//
// Returns a 16x16 (configurable) HTMLCanvasElement for any inventory stack so
// the UI can render an actual sprite instead of the item's display name.
//
// Two code paths:
//   * Blocks  -> isometric cube composed of three faces (top, left, right)
//                using the same pattern generators the world atlas uses, so
//                an inventory icon looks identical to the block in-world.
//   * Items   -> hand-drawn sprite per name (food, tools, raw materials,
//                spawn eggs, etc.). Unknown items get a deterministic
//                generated sprite based on their name and item color.
//
// All canvases are cached by a stable key so we never regenerate the same
// icon twice (slots get repainted constantly).

import { generators } from '../textures/patterns.js'
import { blocks, blocksByName } from '../blocks/registry.js'
import { getItem } from '../items/itemRegistry.js'

const ICON_SIZE = 32
// We render the cube into a larger off-screen buffer (anti-alias-ish via
// integer downscale) then drawImage into the final ICON_SIZE canvas.
const CUBE_RENDER_SIZE = 64
const PATTERN_TILE_SIZE = 16

const cache = new Map()

function cacheKey(stack) {
  if (!stack) return null
  if (stack.blockId != null) return `b:${stack.blockId}`
  if (stack.itemId != null) return `i:${stack.itemId}`
  if (stack.id != null) return `r:${stack.id}`
  if (stack.name) return `n:${stack.name}`
  return null
}

function newCanvas(size) {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  c.style.imageRendering = 'pixelated'
  return c
}

function patternCanvas(key, pattern, color) {
  const gen = generators[pattern] || generators.solid
  const pixels = gen(PATTERN_TILE_SIZE, color, key || pattern)
  const c = newCanvas(PATTERN_TILE_SIZE)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(PATTERN_TILE_SIZE, PATTERN_TILE_SIZE)
  img.data.set(pixels)
  ctx.putImageData(img, 0, 0)
  return c
}

function faceForBlock(block, face) {
  // Mirrors textures/atlas.js textureFor() but returns only what we need to
  // run a generator (no DataTexture lifting). Kept inline to avoid coupling.
  const TEXTURES = {
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
    iron_block: { pattern: 'shiny', color: [211, 211, 214] },
    coal_block: { pattern: 'shiny', color: [45, 45, 45] },
    copper_block: { pattern: 'shiny', color: [210, 126, 82] },
    gold_block: { pattern: 'shiny', color: [246, 202, 74] },
    diamond_block: { pattern: 'shiny', color: [90, 230, 230] },
    lapis_block: { pattern: 'shiny', color: [58, 86, 210] },
    emerald_block: { pattern: 'shiny', color: [70, 220, 110] },
    redstone_block: { pattern: 'shiny', color: [210, 42, 42] },
    glass: { pattern: 'glass', color: [200, 240, 255] },
    chest_front: { pattern: 'chest', color: [140, 100, 60] },
    chest_side: { pattern: 'chest_side', color: [140, 100, 60] },
    pumpkin: { pattern: 'pumpkin', color: [220, 120, 30] }
  }
  // Replicate textureKeyFor inline.
  let key = null
  if (block?.faces?.[face]) key = block.faces[face]
  else if (block?.texture) key = block.texture
  else if (face === 'left' || face === 'right') {
    key = block?.faces?.side || block?.texture || block?.name
  } else if (block?.name === 'grass') {
    key = face === 'top' ? 'grass_top' : face === 'bottom' ? 'dirt' : 'grass_side'
  } else if (block?.name === 'oak_log') {
    key = face === 'side' ? 'log_side' : 'log_top'
  } else key = block?.name
  const t = TEXTURES[key]
  if (t) return { key, pattern: t.pattern, color: t.color }
  if (block?.name?.endsWith('_ore')) {
    return { key, pattern: 'ore', color: block.color || [150, 150, 150] }
  }
  return { key, pattern: block?.pattern || 'solid', color: block?.color || [128, 128, 128] }
}

// Draw a quadrilateral textured with a source canvas. Three.js style affine
// approximation: split the quad into two triangles and use canvas transforms
// per triangle so the source tile maps roughly onto the parallelogram face.
function drawAffineTexturedQuad(ctx, src, p0, p1, p2, p3, shadeAlpha, shadeColor) {
  // p0 = top-left of source (0,0), p1 = top-right (w,0),
  // p2 = bottom-right (w,h), p3 = bottom-left (0,h)
  const w = src.width
  const h = src.height
  drawAffineTriangle(ctx, src, [0,0,w,0,0,h], [p0,p1,p3])
  drawAffineTriangle(ctx, src, [w,0,w,h,0,h], [p1,p2,p3])
  if (shadeAlpha > 0) {
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(p0[0], p0[1])
    ctx.lineTo(p1[0], p1[1])
    ctx.lineTo(p2[0], p2[1])
    ctx.lineTo(p3[0], p3[1])
    ctx.closePath()
    ctx.fillStyle = `rgba(${shadeColor[0]},${shadeColor[1]},${shadeColor[2]},${shadeAlpha})`
    ctx.fill()
    ctx.restore()
  }
}

function drawAffineTriangle(ctx, src, srcTri, dstTri) {
  const [sx0, sy0, sx1, sy1, sx2, sy2] = srcTri
  const [[dx0, dy0], [dx1, dy1], [dx2, dy2]] = dstTri
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(dx0, dy0)
  ctx.lineTo(dx1, dy1)
  ctx.lineTo(dx2, dy2)
  ctx.closePath()
  ctx.clip()
  const denom = (sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1))
  if (Math.abs(denom) < 1e-6) { ctx.restore(); return }
  const a = (dx0 * (sy1 - sy2) + dx1 * (sy2 - sy0) + dx2 * (sy0 - sy1)) / denom
  const b = (dy0 * (sy1 - sy2) + dy1 * (sy2 - sy0) + dy2 * (sy0 - sy1)) / denom
  const c = (dx0 * (sx2 - sx1) + dx1 * (sx0 - sx2) + dx2 * (sx1 - sx0)) / denom
  const d = (dy0 * (sx2 - sx1) + dy1 * (sx0 - sx2) + dy2 * (sx1 - sx0)) / denom
  const e = dx0 - a * sx0 - c * sy0
  const f = dy0 - b * sx0 - d * sy0
  ctx.setTransform(a, b, c, d, e, f)
  ctx.drawImage(src, 0, 0)
  ctx.restore()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

function renderCubeIcon(block) {
  const buf = newCanvas(CUBE_RENDER_SIZE)
  const ctx = buf.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, CUBE_RENDER_SIZE, CUBE_RENDER_SIZE)

  const topFace = faceForBlock(block, 'top')
  const leftFace = faceForBlock(block, 'left')
  const rightFace = faceForBlock(block, 'right')
  const topTex = patternCanvas(topFace.key, topFace.pattern, topFace.color)
  const leftTex = patternCanvas(leftFace.key, leftFace.pattern, leftFace.color)
  const rightTex = patternCanvas(rightFace.key, rightFace.pattern, rightFace.color)

  // Iso cube vertices in render-buffer coords. Cube takes ~80% of buffer.
  const cx = CUBE_RENDER_SIZE / 2
  const inset = 4
  const half = (CUBE_RENDER_SIZE - inset * 2) / 2
  const dyTop = half * 0.5 // vertical drop per iso step

  const topBack  = [cx,           inset]
  const topRight = [cx + half,    inset + dyTop]
  const topFront = [cx,           inset + dyTop * 2]
  const topLeft  = [cx - half,    inset + dyTop]
  const botFront = [cx,           CUBE_RENDER_SIZE - inset]
  const botLeft  = [cx - half,    CUBE_RENDER_SIZE - inset - dyTop]
  const botRight = [cx + half,    CUBE_RENDER_SIZE - inset - dyTop]

  // Right face — darker shading.
  drawAffineTexturedQuad(ctx, rightTex,
    topFront, topRight, botRight, botFront,
    0.28, [0, 0, 0])
  // Left face — medium shading.
  drawAffineTexturedQuad(ctx, leftTex,
    topLeft, topFront, botFront, botLeft,
    0.14, [0, 0, 0])
  // Top face — full bright.
  drawAffineTexturedQuad(ctx, topTex,
    topLeft, topBack, topRight, topFront,
    0, [0, 0, 0])

  if (block?.name === 'furnace') {
    ctx.save()
    ctx.fillStyle = 'rgba(30,30,30,0.55)'
    ctx.fillRect(20, 24, 24, 18)
    ctx.fillStyle = 'rgba(0,0,0,0.88)'
    ctx.fillRect(18, 22, 28, 22)
    ctx.fillStyle = 'rgba(255,145,35,0.92)'
    ctx.fillRect(22, 28, 20, 10)
    ctx.fillStyle = 'rgba(60,60,60,0.8)'
    ctx.fillRect(20, 44, 6, 4)
    ctx.fillRect(38, 44, 6, 4)
    ctx.restore()
  }

  // Outline for definition.
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(topBack[0], topBack[1])
  ctx.lineTo(topRight[0], topRight[1])
  ctx.lineTo(botRight[0], botRight[1])
  ctx.lineTo(botFront[0], botFront[1])
  ctx.lineTo(botLeft[0], botLeft[1])
  ctx.lineTo(topLeft[0], topLeft[1])
  ctx.closePath()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(topFront[0], topFront[1])
  ctx.lineTo(topLeft[0], topLeft[1])
  ctx.moveTo(topFront[0], topFront[1])
  ctx.lineTo(topRight[0], topRight[1])
  ctx.moveTo(topFront[0], topFront[1])
  ctx.lineTo(botFront[0], botFront[1])
  ctx.stroke()

  const out = newCanvas(ICON_SIZE)
  const octx = out.getContext('2d')
  octx.imageSmoothingEnabled = false
  octx.drawImage(buf, 0, 0, ICON_SIZE, ICON_SIZE)
  return out
}

// --- Hand-drawn item sprites ---
//
// Each drawer fills a 16x16 canvas context. We keep them dead simple:
// blocky pixel art, palette-driven.

function px(ctx, x, y, color, w = 1, h = 1) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

function drawStick(ctx) {
  px(ctx, 3, 12, '#5b3a1f', 2, 3)
  px(ctx, 4, 4, '#8a5a2b', 2, 9)
  px(ctx, 4, 4, '#a8723a', 1, 7)
  px(ctx, 10, 2, '#5b3a1f', 2, 3)
}

function hashName(name) {
  let h = 2166136261
  const s = String(name || 'unknown')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rgb(color, fallback = [180, 180, 180]) {
  const c = color || fallback
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

function shadeRgb(color, delta, fallback = [180, 180, 180]) {
  const c = color || fallback
  return `rgb(${Math.max(0, Math.min(255, c[0] + delta))},${Math.max(0, Math.min(255, c[1] + delta))},${Math.max(0, Math.min(255, c[2] + delta))})`
}

function drawHandle(ctx, sx = 11, sy = 11, len = 9, w = 2) {
  // Diagonal wooden handle from bottom-left to top-right of icon.
  for (let i = 0; i < len; i++) {
    px(ctx, sx - i, sy - i, '#7a4f24', w, w)
  }
  for (let i = 0; i < len; i++) {
    px(ctx, sx - i, sy - i, '#a8723a', 1, 1)
  }
}

function drawAxeHead(ctx, color) {
  px(ctx, 8, 1, color, 6, 5)
  px(ctx, 7, 2, color, 1, 3)
  px(ctx, 14, 2, color, 1, 2)
  // edge highlight
  px(ctx, 13, 1, '#ffffff60', 1, 1)
  px(ctx, 8, 5, '#00000040', 6, 1)
}

function drawPickHead(ctx, color) {
  px(ctx, 3, 2, color, 10, 2)
  px(ctx, 2, 3, color, 1, 1)
  px(ctx, 13, 3, color, 1, 1)
  px(ctx, 7, 4, color, 2, 1)
  px(ctx, 3, 2, '#ffffff50', 10, 1)
}

function drawShovelHead(ctx, color) {
  px(ctx, 9, 1, color, 4, 5)
  px(ctx, 10, 6, color, 2, 1)
  px(ctx, 9, 1, '#ffffff50', 4, 1)
}

function drawSwordBlade(ctx, color) {
  px(ctx, 11, 2, color, 1, 8)
  px(ctx, 10, 3, color, 1, 6)
  px(ctx, 12, 3, color, 1, 6)
  px(ctx, 13, 2, color, 1, 1)
  px(ctx, 11, 2, '#ffffff70', 1, 7)
  // guard
  px(ctx, 9, 10, '#5b3a1f', 4, 1)
  px(ctx, 10, 11, '#7a4f24', 2, 1)
  // grip
  px(ctx, 8, 12, '#3d2615', 2, 3)
}

function drawHoeHead(ctx, color) {
  px(ctx, 9, 1, color, 5, 2)
  px(ctx, 13, 3, color, 1, 1)
  px(ctx, 9, 1, '#ffffff50', 5, 1)
}

const TOOL_COLORS = {
  wood: '#a8723a',
  wooden: '#a8723a',
  stone: '#7d7d7d',
  iron: '#d4d4d8',
  gold: '#f0c850',
  golden: '#f0c850',
  diamond: '#5be6e6'
}

function drawToolKindFor(prefix, ctx) {
  // prefix like 'wooden_pickaxe', 'iron_axe', etc.
  const parts = prefix.split('_')
  const material = parts[0]
  const kind = parts.slice(1).join('_')
  const color = TOOL_COLORS[material] || '#d4d4d8'
  if (kind !== 'pickaxe' && kind !== 'axe' && kind !== 'shovel' && kind !== 'spade' && kind !== 'sword' && kind !== 'hoe') return false
  drawHandle(ctx)
  if (kind === 'pickaxe') drawPickHead(ctx, color)
  else if (kind === 'axe') drawAxeHead(ctx, color)
  else if (kind === 'shovel' || kind === 'spade') drawShovelHead(ctx, color)
  else if (kind === 'sword') drawSwordBlade(ctx, color)
  else if (kind === 'hoe') drawHoeHead(ctx, color)
  return true
}

function drawSpawnEgg(ctx, color) {
  // Egg shape with mob-specific tint and spots.
  const tint = color || [200, 200, 200]
  const base = `rgb(${tint[0]},${tint[1]},${tint[2]})`
  const shade = `rgb(${Math.max(0, tint[0] - 50)},${Math.max(0, tint[1] - 50)},${Math.max(0, tint[2] - 50)})`
  // Egg outline
  px(ctx, 6, 2, base, 4, 1)
  px(ctx, 5, 3, base, 6, 1)
  px(ctx, 4, 4, base, 8, 2)
  px(ctx, 4, 6, base, 8, 6)
  px(ctx, 5, 12, base, 6, 1)
  px(ctx, 6, 13, base, 4, 1)
  // Spots
  px(ctx, 5, 5, shade, 1, 1)
  px(ctx, 9, 7, shade, 1, 1)
  px(ctx, 6, 9, shade, 2, 1)
  px(ctx, 10, 10, shade, 1, 2)
  // Highlight
  px(ctx, 6, 4, '#ffffff80', 2, 1)
}

function drawRedstone(ctx) {
  px(ctx, 3, 8, '#8c1515', 9, 4)
  px(ctx, 5, 6, '#c43030', 7, 4)
  px(ctx, 7, 5, '#e24242', 4, 2)
  px(ctx, 5, 7, '#ff5858', 1, 1)
  px(ctx, 11, 10, '#5d0f0f', 1, 1)
  px(ctx, 4, 12, '#5d0f0f', 6, 1)
}

function drawMutton(ctx, cooked = false) {
  const base = cooked ? '#9b5f38' : '#df766e'
  const dark = cooked ? '#5c321e' : '#984046'
  const light = cooked ? '#d49a60' : '#f3aaa0'
  px(ctx, 4, 5, base, 8, 7)
  px(ctx, 5, 4, base, 6, 1)
  px(ctx, 3, 7, base, 2, 3)
  px(ctx, 5, 12, dark, 6, 1)
  px(ctx, 6, 7, light, 4, 2)
  px(ctx, 11, 6, '#efe5c8', 2, 2)
  px(ctx, 12, 5, '#f8efd8', 1, 1)
}

function drawCarrot(ctx) {
  px(ctx, 6, 5, '#f28a1c', 5, 8)
  px(ctx, 5, 7, '#f28a1c', 1, 5)
  px(ctx, 8, 13, '#b45a10', 2, 1)
  px(ctx, 7, 6, '#ffbd45', 2, 1)
  px(ctx, 8, 2, '#4c9f38', 1, 4)
  px(ctx, 6, 3, '#62b44a', 1, 3)
  px(ctx, 10, 3, '#397d2c', 1, 3)
}

function drawPotato(ctx) {
  px(ctx, 5, 4, '#c8a65a', 6, 9)
  px(ctx, 4, 6, '#c8a65a', 8, 5)
  px(ctx, 5, 12, '#8b6a32', 5, 1)
  px(ctx, 6, 5, '#dfc073', 2, 1)
  px(ctx, 9, 7, '#735025', 1, 1)
  px(ctx, 6, 10, '#735025', 1, 1)
}

function drawBoneMeal(ctx) {
  px(ctx, 5, 6, '#e8e8dd', 7, 5)
  px(ctx, 4, 8, '#f7f7ef', 9, 4)
  px(ctx, 6, 5, '#ffffff', 3, 1)
  px(ctx, 5, 12, '#bdbda8', 6, 1)
  px(ctx, 8, 7, '#d2d2c2', 1, 1)
  px(ctx, 11, 9, '#d2d2c2', 1, 1)
}

function drawWheat(ctx) {
  const stem = '#b98b2d'
  const grain = '#e0bd52'
  px(ctx, 8, 4, stem, 1, 10)
  px(ctx, 6, 7, stem, 1, 7)
  px(ctx, 10, 7, stem, 1, 7)
  px(ctx, 7, 3, grain, 3, 2)
  px(ctx, 5, 5, grain, 3, 2)
  px(ctx, 9, 5, grain, 3, 2)
  px(ctx, 4, 8, grain, 3, 2)
  px(ctx, 10, 8, grain, 3, 2)
  px(ctx, 6, 11, '#7b5420', 6, 1)
}

function drawSeeds(ctx) {
  const colors = ['#b4a064', '#d0c078', '#827040']
  const points = [[5, 7], [8, 6], [10, 8], [6, 10], [9, 11], [4, 9]]
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i]
    px(ctx, x, y, colors[i % colors.length], 2, 1)
    px(ctx, x + 1, y + 1, colors[(i + 1) % colors.length], 1, 1)
  }
}

function drawFlintAndSteel(ctx) {
  px(ctx, 4, 4, '#2e3038', 4, 7)
  px(ctx, 5, 3, '#4a4c55', 3, 1)
  px(ctx, 8, 5, '#c6c6c6', 4, 2)
  px(ctx, 10, 6, '#e5e5e5', 2, 5)
  px(ctx, 7, 11, '#777780', 5, 1)
  px(ctx, 11, 3, '#f0a020', 1, 2)
  px(ctx, 12, 4, '#ffd85a', 1, 1)
}

const ITEM_DRAWERS = {
  stick: drawStick,
  flint_and_steel: drawFlintAndSteel,
  mutton: (ctx) => drawMutton(ctx, false),
  cooked_mutton: (ctx) => drawMutton(ctx, true),
  redstone: drawRedstone,
  wheat_seeds: drawSeeds,
  carrot_item: drawCarrot,
  potato_item: drawPotato,
  bone_meal: drawBoneMeal,
  wheat: drawWheat,
  leather_helmet: (ctx) => drawArmorPiece(ctx, 'helmet', '#a06540'),
  leather_chestplate: (ctx) => drawArmorPiece(ctx, 'chestplate', '#a06540'),
  leather_leggings: (ctx) => drawArmorPiece(ctx, 'leggings', '#a06540'),
  leather_boots: (ctx) => drawArmorPiece(ctx, 'boots', '#a06540'),
  golden_helmet: (ctx) => drawArmorPiece(ctx, 'helmet', '#f6ca4a'),
  golden_chestplate: (ctx) => drawArmorPiece(ctx, 'chestplate', '#f6ca4a'),
  golden_leggings: (ctx) => drawArmorPiece(ctx, 'leggings', '#f6ca4a'),
  golden_boots: (ctx) => drawArmorPiece(ctx, 'boots', '#f6ca4a'),
  iron_helmet: (ctx) => drawArmorPiece(ctx, 'helmet', '#d2d2dc'),
  iron_chestplate: (ctx) => drawArmorPiece(ctx, 'chestplate', '#d2d2dc'),
  iron_leggings: (ctx) => drawArmorPiece(ctx, 'leggings', '#d2d2dc'),
  iron_boots: (ctx) => drawArmorPiece(ctx, 'boots', '#d2d2dc'),
  diamond_helmet: (ctx) => drawArmorPiece(ctx, 'helmet', '#5ae6e6'),
  diamond_chestplate: (ctx) => drawArmorPiece(ctx, 'chestplate', '#5ae6e6'),
  diamond_leggings: (ctx) => drawArmorPiece(ctx, 'leggings', '#5ae6e6'),
  diamond_boots: (ctx) => drawArmorPiece(ctx, 'boots', '#5ae6e6'),
  bread: (ctx) => {
    px(ctx, 3, 5, '#c08a4a', 10, 6)
    px(ctx, 4, 4, '#c08a4a', 8, 1)
    px(ctx, 4, 11, '#c08a4a', 8, 1)
    px(ctx, 5, 6, '#e4b274', 6, 4)
    px(ctx, 6, 7, '#f7d29a', 1, 1)
    px(ctx, 9, 8, '#f7d29a', 1, 1)
  },
  apple: (ctx) => {
    px(ctx, 5, 4, '#cc2828', 6, 8)
    px(ctx, 4, 5, '#cc2828', 1, 6)
    px(ctx, 11, 5, '#cc2828', 1, 6)
    px(ctx, 5, 12, '#a02020', 6, 1)
    px(ctx, 6, 5, '#ff6060', 2, 2)
    px(ctx, 7, 2, '#5b3a1f', 1, 3)
    px(ctx, 8, 1, '#4d8b3a', 2, 2)
  },
  egg: (ctx) => {
    px(ctx, 6, 2, '#fff8e0', 4, 1)
    px(ctx, 5, 3, '#fff8e0', 6, 1)
    px(ctx, 4, 4, '#fff8e0', 8, 9)
    px(ctx, 5, 13, '#fff8e0', 6, 1)
    px(ctx, 5, 4, '#ffffff', 3, 4)
    px(ctx, 5, 12, '#d6c89c', 6, 1)
  },
  raw_iron: (ctx) => {
    px(ctx, 4, 5, '#a89a8a', 8, 6)
    px(ctx, 5, 4, '#a89a8a', 6, 1)
    px(ctx, 5, 11, '#a89a8a', 6, 1)
    px(ctx, 5, 5, '#cabfae', 4, 2)
    px(ctx, 6, 8, '#7a6e60', 2, 1)
  },
  raw_copper: (ctx) => {
    px(ctx, 4, 5, '#c47148', 8, 6)
    px(ctx, 5, 4, '#c47148', 6, 1)
    px(ctx, 5, 11, '#c47148', 6, 1)
    px(ctx, 5, 5, '#e08e5e', 4, 2)
    px(ctx, 6, 8, '#874a2c', 2, 1)
  },
  raw_gold: (ctx) => {
    px(ctx, 4, 5, '#e7be4a', 8, 6)
    px(ctx, 5, 4, '#e7be4a', 6, 1)
    px(ctx, 5, 11, '#e7be4a', 6, 1)
    px(ctx, 5, 5, '#ffe79a', 4, 2)
    px(ctx, 6, 8, '#b08a20', 2, 1)
  },
  coal: (ctx) => {
    px(ctx, 4, 5, '#1f1f24', 8, 6)
    px(ctx, 5, 4, '#1f1f24', 6, 1)
    px(ctx, 5, 11, '#1f1f24', 6, 1)
    px(ctx, 6, 6, '#444450', 2, 2)
  },
  diamond: (ctx) => {
    px(ctx, 7, 2, '#5be6e6', 2, 1)
    px(ctx, 6, 3, '#5be6e6', 4, 1)
    px(ctx, 5, 4, '#5be6e6', 6, 1)
    px(ctx, 4, 5, '#5be6e6', 8, 4)
    px(ctx, 5, 9, '#5be6e6', 6, 1)
    px(ctx, 6, 10, '#5be6e6', 4, 1)
    px(ctx, 7, 11, '#5be6e6', 2, 1)
    px(ctx, 7, 4, '#ffffff', 2, 2)
  },
  emerald: (ctx) => {
    px(ctx, 5, 3, '#46dc6e', 6, 10)
    px(ctx, 4, 5, '#46dc6e', 1, 6)
    px(ctx, 11, 5, '#46dc6e', 1, 6)
    px(ctx, 6, 4, '#a0ffb0', 2, 3)
  },
  lapis_lazuli: (ctx) => {
    px(ctx, 4, 5, '#3a56d2', 8, 6)
    px(ctx, 5, 4, '#3a56d2', 6, 1)
    px(ctx, 5, 11, '#3a56d2', 6, 1)
    px(ctx, 6, 6, '#7ea0ff', 2, 2)
    px(ctx, 9, 8, '#1a36a0', 1, 1)
  },
  redstone_dust: (ctx) => {
    drawRedstone(ctx)
  },
  iron_ingot: (ctx) => {
    px(ctx, 4, 6, '#d4d4d8', 8, 4)
    px(ctx, 5, 5, '#d4d4d8', 6, 1)
    px(ctx, 5, 10, '#d4d4d8', 6, 1)
    px(ctx, 5, 6, '#f0f0f4', 6, 1)
    px(ctx, 5, 9, '#9a9a9e', 6, 1)
  },
  gold_ingot: (ctx) => {
    px(ctx, 4, 6, '#f0c850', 8, 4)
    px(ctx, 5, 5, '#f0c850', 6, 1)
    px(ctx, 5, 10, '#f0c850', 6, 1)
    px(ctx, 5, 6, '#ffe690', 6, 1)
    px(ctx, 5, 9, '#a88420', 6, 1)
  },
  copper_ingot: (ctx) => {
    px(ctx, 4, 6, '#c47148', 8, 4)
    px(ctx, 5, 5, '#c47148', 6, 1)
    px(ctx, 5, 10, '#c47148', 6, 1)
    px(ctx, 5, 6, '#e89060', 6, 1)
    px(ctx, 5, 9, '#7a4524', 6, 1)
  },
  porkchop_raw: (ctx) => {
    px(ctx, 4, 5, '#f0a09a', 8, 7)
    px(ctx, 5, 4, '#f0a09a', 6, 1)
    px(ctx, 5, 12, '#f0a09a', 6, 1)
    px(ctx, 6, 7, '#c46868', 4, 2)
  },
  porkchop_cooked: (ctx) => {
    px(ctx, 4, 5, '#c08560', 8, 7)
    px(ctx, 5, 4, '#c08560', 6, 1)
    px(ctx, 5, 12, '#c08560', 6, 1)
    px(ctx, 6, 7, '#8a5030', 4, 2)
  },
  beef_raw: (ctx) => {
    px(ctx, 4, 5, '#d04050', 8, 7)
    px(ctx, 5, 4, '#d04050', 6, 1)
    px(ctx, 5, 12, '#d04050', 6, 1)
    px(ctx, 6, 7, '#a02030', 4, 2)
    px(ctx, 8, 6, '#f8f8f8', 1, 1)
  },
  beef_cooked: (ctx) => {
    px(ctx, 4, 5, '#8a4828', 8, 7)
    px(ctx, 5, 4, '#8a4828', 6, 1)
    px(ctx, 5, 12, '#8a4828', 6, 1)
    px(ctx, 6, 7, '#5a2a18', 4, 2)
  },
  chicken_raw: (ctx) => {
    px(ctx, 4, 5, '#f0c0a0', 8, 7)
    px(ctx, 5, 4, '#f0c0a0', 6, 1)
    px(ctx, 5, 12, '#f0c0a0', 6, 1)
  },
  chicken_cooked: (ctx) => {
    px(ctx, 4, 5, '#c89060', 8, 7)
    px(ctx, 5, 4, '#c89060', 6, 1)
    px(ctx, 5, 12, '#c89060', 6, 1)
  },
  bucket: (ctx) => {
    px(ctx, 3, 5, '#c0c0c8', 10, 7)
    px(ctx, 4, 4, '#c0c0c8', 8, 1)
    px(ctx, 4, 12, '#9090a0', 8, 1)
    px(ctx, 3, 5, '#e0e0e8', 1, 7)
    px(ctx, 12, 5, '#9090a0', 1, 7)
    px(ctx, 5, 3, '#888890', 6, 1)
  },
  water_bucket: (ctx) => {
    px(ctx, 3, 5, '#c0c0c8', 10, 7)
    px(ctx, 4, 4, '#c0c0c8', 8, 1)
    px(ctx, 4, 12, '#9090a0', 8, 1)
    px(ctx, 4, 5, '#3870c8', 8, 5)
  },
  lava_bucket: (ctx) => {
    px(ctx, 3, 5, '#c0c0c8', 10, 7)
    px(ctx, 4, 4, '#c0c0c8', 8, 1)
    px(ctx, 4, 12, '#9090a0', 8, 1)
    px(ctx, 4, 5, '#e8701c', 8, 5)
    px(ctx, 5, 6, '#ffc858', 6, 1)
  }
}

function drawArmorPiece(ctx, part, color) {
  const base = color
  const dark = shade(color, -34)
  const light = shade(color, 24)
  if (part === 'helmet') {
    px(ctx, 4, 2, dark, 8, 2)
    px(ctx, 3, 4, base, 10, 4)
    px(ctx, 4, 8, base, 8, 2)
    px(ctx, 5, 10, dark, 6, 1)
    px(ctx, 5, 5, light, 2, 1)
    px(ctx, 9, 5, light, 2, 1)
    px(ctx, 6, 11, dark, 4, 1)
    return
  }
  if (part === 'chestplate') {
    px(ctx, 4, 2, dark, 8, 2)
    px(ctx, 3, 4, base, 10, 8)
    px(ctx, 2, 6, base, 2, 4)
    px(ctx, 12, 6, base, 2, 4)
    px(ctx, 5, 5, light, 6, 2)
    px(ctx, 5, 12, dark, 2, 2)
    px(ctx, 9, 12, dark, 2, 2)
    return
  }
  if (part === 'leggings') {
    px(ctx, 4, 2, dark, 8, 2)
    px(ctx, 3, 4, base, 10, 3)
    px(ctx, 4, 7, base, 3, 7)
    px(ctx, 9, 7, base, 3, 7)
    px(ctx, 4, 10, light, 3, 2)
    px(ctx, 9, 10, light, 3, 2)
    return
  }
  if (part === 'boots') {
    px(ctx, 4, 4, base, 3, 6)
    px(ctx, 9, 4, base, 3, 6)
    px(ctx, 3, 10, dark, 5, 2)
    px(ctx, 8, 10, dark, 5, 2)
    px(ctx, 4, 3, light, 2, 1)
    px(ctx, 9, 3, light, 2, 1)
  }
}

function shade(color, delta) {
  const hex = color.startsWith('#') ? color.slice(1) : color
  const n = parseInt(hex, 16)
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + delta))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + delta))
  const b = Math.max(0, Math.min(255, (n & 255) + delta))
  return `rgb(${r},${g},${b})`
}

function drawItemSprite(name, color, ctx) {
  if (!name) return false
  if (name === 'diamond_sword' || name === 'iron_sword' || name === 'golden_sword' || name === 'wooden_sword' || name === 'stone_sword') return drawToolKindFor(name, ctx)
  if (ITEM_DRAWERS[name]) { ITEM_DRAWERS[name](ctx); return true }
  if (name.endsWith('_spawn_egg')) { drawSpawnEgg(ctx, color); return true }
  if (drawToolKindFor(name, ctx)) return true
  return false
}

function drawGeneratedItemSprite(item, ctx) {
  const color = item?.color || [180, 180, 180]
  const base = rgb(color)
  const light = shadeRgb(color, 42)
  const dark = shadeRgb(color, -54)
  const h = hashName(item?.name)
  const variant = h % 5

  if (variant === 0) {
    px(ctx, 7, 2, light, 2, 1)
    px(ctx, 5, 3, base, 6, 2)
    px(ctx, 4, 5, base, 8, 5)
    px(ctx, 5, 10, dark, 6, 2)
    px(ctx, 6, 12, dark, 4, 1)
  } else if (variant === 1) {
    px(ctx, 4, 4, dark, 8, 8)
    px(ctx, 5, 3, base, 6, 1)
    px(ctx, 5, 5, base, 6, 6)
    px(ctx, 6, 6, light, 2, 2)
    px(ctx, 10, 9, dark, 1, 1)
  } else if (variant === 2) {
    px(ctx, 6, 2, dark, 4, 2)
    px(ctx, 5, 4, base, 6, 8)
    px(ctx, 6, 12, dark, 4, 1)
    px(ctx, 6, 5, light, 2, 4)
  } else if (variant === 3) {
    px(ctx, 7, 3, base, 2, 10)
    px(ctx, 3, 7, base, 10, 2)
    px(ctx, 5, 5, dark, 6, 6)
    px(ctx, 6, 6, light, 4, 4)
  } else {
    px(ctx, 5, 3, base, 5, 3)
    px(ctx, 4, 6, base, 8, 4)
    px(ctx, 6, 10, dark, 4, 3)
    px(ctx, 5, 4, light, 2, 1)
    px(ctx, 10, 8, dark, 1, 1)
  }

  const mark = h >>> 5
  for (let i = 0; i < 4; i++) {
    const x = 4 + ((mark >>> (i * 3)) & 7)
    const y = 4 + ((mark >>> (i * 5)) & 7)
    px(ctx, x, y, (i % 2 === 0) ? light : dark, 1, 1)
  }
}

function renderItemIcon(item) {
  const blockForm = blocksByName.get(item?.name)
  if (blockForm && blockForm.name !== 'air') return renderCubeIcon(blockForm)

  const c = newCanvas(ICON_SIZE)
  const ctx = c.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.scale(2, 2)
  const drew = drawItemSprite(item?.name, item?.color, ctx)
  if (drew) return c
  drawGeneratedItemSprite(item, ctx)
  return c
}

function cloneCanvas(oldCanvas) {
  if (!oldCanvas) return null
  const newCanvas = document.createElement('canvas')
  newCanvas.width = oldCanvas.width
  newCanvas.height = oldCanvas.height
  newCanvas.style.imageRendering = oldCanvas.style.imageRendering
  const ctx = newCanvas.getContext('2d')
  ctx.drawImage(oldCanvas, 0, 0)
  return newCanvas
}

// Public entry point. Accepts a stack { id, name?, blockId?, itemId?, count } or
// a raw { name, color } descriptor.
export function getIconCanvas(stack) {
  if (!stack) return null
  const key = cacheKey(stack)
  if (key && cache.has(key)) return cloneCanvas(cache.get(key))

  let canvas = null
  // Block stacks point at a block id in the global blocks registry.
  const blockId = stack.blockId != null ? stack.blockId : (typeof stack.id === 'number' && blocks[stack.id] ? stack.id : null)
  if (blockId != null && blocks[blockId] && blocks[blockId].name !== 'air') {
    canvas = renderCubeIcon(blocks[blockId])
  } else {
    // Item stack — try item registry by id, then by name.
    let item = null
    if (stack.itemId != null) item = getItem(stack.itemId)
    if (!item && typeof stack.id === 'number') item = getItem(stack.id)
    if (!item && stack.name) item = { name: stack.name, color: stack.color }
    if (!item) item = { name: stack.name || 'unknown', color: stack.color }
    canvas = renderItemIcon(item)
  }

  if (key) cache.set(key, canvas)
  return key ? cloneCanvas(canvas) : canvas
}

export function clearIconCache() {
  cache.clear()
}

export const ICON_PIXEL_SIZE = ICON_SIZE
