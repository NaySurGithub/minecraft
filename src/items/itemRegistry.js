import { blocks, blocksByName } from '../blocks/registry.js'
import { getLanguage } from '../ui/translator.js'
import { itemDefs } from '../../packages/game-core/src/content.js'
export * from '../../packages/game-core/src/item-exports.js'

export const ITEM_ID_BASE = 4096

const itemsRoot = globalThis.__nazzandnaycraftItems || (globalThis.__nazzandnaycraftItems = {
  items: [],
  itemsByName: new Map(),
  nextItemId: ITEM_ID_BASE
})

itemsRoot.items.length = 0
itemsRoot.itemsByName.clear()
itemsRoot.nextItemId = ITEM_ID_BASE

export const items = itemsRoot.items
export const itemsByName = itemsRoot.itemsByName

let nextItemId = ITEM_ID_BASE

function prettyName(name) {
  return String(name || '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

function displayLabel(def) {
  if (!def) return ''
  if (getLanguage() === 'en') return prettyName(def.name)
  return def.label || prettyName(def.name)
}

export function defineItem(name, props = {}) {
  if (itemsByName.has(name)) return editItem(name, props).id
  const id = nextItemId++
  const item = {
    ...props,
    id,
    name,
    label: props.label || name,
    stackSize: props.stackSize || 64,
    color: props.color || [200, 200, 200],
    food: props.food || 0,
    category: props.category || 'item',
    toolKind: props.toolKind || null,
    isItem: true
  }
  items[id - ITEM_ID_BASE] = item
  itemsByName.set(name, item)
  itemsRoot.nextItemId = nextItemId
  return id
}

export function defineSpawnEgg(name, props = {}) {
  return defineItem(name, {
    label: props.label || name + ' Spawn Egg',
    stackSize: 1,
    color: props.color || [220, 220, 220],
    category: 'spawn_egg',
    toolKind: null,
    spawnMob: props.spawnMob || null
  })
}

export function editItem(name, props = {}) {
  const item = itemsByName.get(name)
  if (!item) return null
  Object.assign(item, props, { id: item.id, name, isItem: true })
  return item
}

export function isItemId(id) {
  return id >= ITEM_ID_BASE
}

export function getItem(id) {
  if (id < ITEM_ID_BASE) return null
  const item = items[id - ITEM_ID_BASE] || null
  return item ? { ...item, label: displayLabel(item) } : null
}

export function getThing(id) {
  if (id >= ITEM_ID_BASE) return getItem(id)
  const block = blocks[id] || null
  return block ? { ...block, label: displayLabel(block) } : null
}

export function getThingByName(name) {
  if (itemsByName.has(name)) return { ...itemsByName.get(name), label: displayLabel(itemsByName.get(name)) }
  if (blocksByName.has(name)) return { ...blocksByName.get(name), label: displayLabel(blocksByName.get(name)) }
  return null
}

for (const def of Array.isArray(itemDefs) ? itemDefs : []) {
  defineItem(def.name, def)
}
