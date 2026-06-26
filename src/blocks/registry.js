import { DEBUG_TEXTURES, debugLog } from '../debug/debug.js'
import { Block } from './Block.js'
import { blockDefs } from '../../packages/game-core/src/content.js'

const blocksRoot = globalThis.__nazzandnaycraftBlocks || (globalThis.__nazzandnaycraftBlocks = {
  blocks: [],
  blocksByName: new Map(),
  nextId: 0
})

blocksRoot.blocks.length = 0
blocksRoot.blocksByName.clear()
blocksRoot.nextId = 0

export const blocks = blocksRoot.blocks
export const blocksByName = blocksRoot.blocksByName
export const AIR = 0

function ensureBlockInstance(entry) {
  if (!entry) return null
  if (entry instanceof Block) return entry
  if (typeof entry === 'function') return new entry()
  if (typeof entry === 'object' && entry.name) return entry
  return null
}

export function defineBlock(name, props = {}) {
  if (blocksByName.has(name)) return editBlock(name, props).id
  const id = blocksRoot.nextId++
  const block = {
    id,
    name,
    solid: props.solid !== false,
    transparent: props.transparent === true,
    liquid: props.liquid === true,
    light: props.light || 0,
    hardness: props.hardness == null ? 1 : props.hardness,
    tool: props.tool || null,
    drops: props.drops || null,
    stackSize: props.stackSize || 64,
    placeable: props.placeable !== false,
    item: props.item === true,
    category: props.category || 'block',
    label: props.label || name,
    faces: props.faces || null,
    color: props.color || [128, 128, 128],
    pattern: props.pattern || 'solid',
    palette: props.palette || null,
    texture: props.texture || null,
    renderType: props.renderType || 'cube',
    model: props.model || null,
    gravity: props.gravity === true
  }
  blocks[id] = block
  blocksByName.set(name, block)
  return id
}

export function editBlock(name, props = {}) {
  const block = blocksByName.get(name)
  if (!block) return null
  Object.assign(block, props, { id: block.id, name })
  return block
}

export function loadVanillaBlocks() {
  const defs = Array.isArray(blockDefs) ? blockDefs : []
  for (const def of defs) {
    const entry = ensureBlockInstance(def)
    if (entry) defineBlock(entry.name, entry)
  }
}

loadVanillaBlocks()

export function getBlockId(name) {
  return blocksByName.get(name)?.id ?? AIR
}

export const blockIds = new Proxy({}, {
  get: (_, prop) => getBlockId(String(prop).toLowerCase()),
  has: (_, prop) => blocksByName.has(String(prop).toLowerCase())
})

if (DEBUG_TEXTURES) {
  debugLog('blocks', 'registry loaded', blocks.filter(Boolean).map((block) => ({
    id: block.id,
    name: block.name,
    pattern: block.pattern,
    color: block.color,
    faces: block.faces
  })))
}
