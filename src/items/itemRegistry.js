import { blocks, blocksByName } from '../blocks/registry.js'
import { getLanguage } from '../ui/translator.js'

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

let nextItemId = itemsRoot.nextItemId

function prettyName(name) {
  return String(name || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

function displayLabel(def) {
  if (!def) return ''
  if (getLanguage() === 'en') return prettyName(def.name)
  return def.label || prettyName(def.name)
}

export function defineItem(name, props = {}) {
  if (itemsByName.has(name)) {
    return editItem(name, props).id
  }
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

const define = defineItem

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
  if (!item) return null
  return { ...item, label: displayLabel(item) }
}

export function getThing(id) {
  if (id >= ITEM_ID_BASE) return getItem(id)
  const block = blocks[id] || null
  if (!block) return null
  return { ...block, label: displayLabel(block) }
}

export function getThingByName(name) {
  if (itemsByName.has(name)) return { ...itemsByName.get(name), label: displayLabel(itemsByName.get(name)) }
  if (blocksByName.has(name)) return { ...blocksByName.get(name), label: displayLabel(blocksByName.get(name)) }
  return null
}

export const MUTTON = define('mutton', { label: 'Raw Mutton', stackSize: 64, color: [224, 122, 110], food: 2 })
export const COOKED_MUTTON = define('cooked_mutton', { label: 'Cooked Mutton', stackSize: 64, color: [150, 96, 60], food: 6 })
export const COAL = define('coal', { label: 'Coal', color: [35, 35, 35] })
export const RAW_COPPER = define('raw_copper', { label: 'Raw Copper', color: [210, 126, 82] })
export const RAW_IRON = define('raw_iron', { label: 'Raw Iron', color: [210, 170, 135] })
export const RAW_GOLD = define('raw_gold', { label: 'Raw Gold', color: [246, 202, 74] })
export const REDSTONE = define('redstone', { label: 'Redstone', color: [210, 42, 42] })
export const LAPIS_LAZULI = define('lapis_lazuli', { label: 'Lapis Lazuli', color: [58, 86, 210] })
export const DIAMOND = define('diamond', { label: 'Diamond', color: [90, 230, 230] })
export const EMERALD = define('emerald', { label: 'Emerald', color: [70, 220, 110] })
export const STICK = define('stick', { label: 'Stick', color: [155, 112, 65] })
export const BONE = define('bone', { label: 'Bone', color: [235, 235, 220] })
export const GUNPOWDER = define('gunpowder', { label: 'Gunpowder', color: [70, 70, 70] })
export const GHAST_TEAR = define('ghast_tear', { label: 'Ghast Tear', color: [230, 235, 255] })
export const BLAZE_ROD = define('blaze_rod', { label: 'Blaze Rod', color: [235, 160, 45] })
export const MAGMA_CREAM = define('magma_cream', { label: 'Magma Cream', color: [220, 96, 58] })
export const WITHER_SKELETON_SKULL = define('wither_skeleton_skull', { label: 'Wither Skeleton Skull', color: [36, 36, 40] })
export const ENDER_PEARL = define('ender_pearl', { label: 'Ender Pearl', color: [40, 175, 145] })
export const RAW_PORKCHOP = define('porkchop', { label: 'Raw Porkchop', color: [232, 134, 136], food: 3 })
export const COOKED_PORKCHOP = define('cooked_porkchop', { label: 'Cooked Porkchop', color: [170, 92, 58], food: 8 })
export const ARROW = define('arrow', { label: 'Arrow', stackSize: 64, color: [215, 215, 200], category: 'ammo' })
export const BOW = define('bow', { label: 'Bow', stackSize: 1, color: [126, 76, 38], category: 'tool', toolKind: 'bow', maxDurability: 384 })
export const BUCKET = define('bucket', { label: 'Bucket', stackSize: 16, color: [176, 176, 176], category: 'tool', toolKind: 'bucket' })
export const WATER_BUCKET = define('water_bucket', { label: 'Water Bucket', stackSize: 1, color: [60, 110, 200], category: 'tool', toolKind: 'bucket' })
export const LAVA_BUCKET = define('lava_bucket', { label: 'Lava Bucket', stackSize: 1, color: [235, 110, 20], category: 'tool', toolKind: 'bucket' })
export const FLINT_AND_STEEL = define('flint_and_steel', { label: 'Flint and Steel', stackSize: 1, color: [180, 180, 180], category: 'tool', toolKind: 'flint_and_steel', maxDurability: 64 })

export const WOODEN_SWORD = define('wooden_sword', { label: 'Wooden Sword', stackSize: 1, color: [150, 105, 58], category: 'tool', toolKind: 'sword', maxDurability: 59 })
export const STONE_SWORD = define('stone_sword', { label: 'Stone Sword', stackSize: 1, color: [120, 120, 126], category: 'tool', toolKind: 'sword', maxDurability: 131 })
export const IRON_SWORD = define('iron_sword', { label: 'Iron Sword', stackSize: 1, color: [210, 210, 220], category: 'tool', toolKind: 'sword', maxDurability: 250 })
export const GOLDEN_SWORD = define('golden_sword', { label: 'Golden Sword', stackSize: 1, color: [246, 202, 74], category: 'tool', toolKind: 'sword', maxDurability: 32 })
export const DIAMOND_SWORD = define('diamond_sword', { label: 'Diamond Sword', stackSize: 1, color: [90, 230, 230], category: 'tool', toolKind: 'sword', maxDurability: 1561 })

export const WOODEN_PICKAXE = define('wooden_pickaxe', { label: 'Wooden Pickaxe', stackSize: 1, color: [150, 105, 58], category: 'tool', toolKind: 'pickaxe', maxDurability: 59 })
export const STONE_PICKAXE = define('stone_pickaxe', { label: 'Stone Pickaxe', stackSize: 1, color: [120, 120, 126], category: 'tool', toolKind: 'pickaxe', maxDurability: 131 })
export const IRON_PICKAXE = define('iron_pickaxe', { label: 'Iron Pickaxe', stackSize: 1, color: [210, 210, 220], category: 'tool', toolKind: 'pickaxe', maxDurability: 250 })
export const GOLDEN_PICKAXE = define('golden_pickaxe', { label: 'Golden Pickaxe', stackSize: 1, color: [246, 202, 74], category: 'tool', toolKind: 'pickaxe', maxDurability: 32 })
export const DIAMOND_PICKAXE = define('diamond_pickaxe', { label: 'Diamond Pickaxe', stackSize: 1, color: [90, 230, 230], category: 'tool', toolKind: 'pickaxe', maxDurability: 1561 })

// Helmets
export const LEATHER_HELMET = define('leather_helmet', { label: 'Leather Helmet', stackSize: 1, color: [160, 101, 64], category: 'armor', armorType: 'helmet', defense: 1, maxDurability: 55 })
export const GOLDEN_HELMET = define('golden_helmet', { label: 'Golden Helmet', stackSize: 1, color: [246, 202, 74], category: 'armor', armorType: 'helmet', defense: 2, maxDurability: 77 })
export const IRON_HELMET = define('iron_helmet', { label: 'Iron Helmet', stackSize: 1, color: [210, 210, 220], category: 'armor', armorType: 'helmet', defense: 2, maxDurability: 165 })
export const DIAMOND_HELMET = define('diamond_helmet', { label: 'Diamond Helmet', stackSize: 1, color: [90, 230, 230], category: 'armor', armorType: 'helmet', defense: 3, maxDurability: 363 })

// Chestplates
export const LEATHER_CHESTPLATE = define('leather_chestplate', { label: 'Leather Chestplate', stackSize: 1, color: [160, 101, 64], category: 'armor', armorType: 'chestplate', defense: 3, maxDurability: 80 })
export const GOLDEN_CHESTPLATE = define('golden_chestplate', { label: 'Golden Chestplate', stackSize: 1, color: [246, 202, 74], category: 'armor', armorType: 'chestplate', defense: 5, maxDurability: 112 })
export const IRON_CHESTPLATE = define('iron_chestplate', { label: 'Iron Chestplate', stackSize: 1, color: [210, 210, 220], category: 'armor', armorType: 'chestplate', defense: 6, maxDurability: 240 })
export const DIAMOND_CHESTPLATE = define('diamond_chestplate', { label: 'Diamond Chestplate', stackSize: 1, color: [90, 230, 230], category: 'armor', armorType: 'chestplate', defense: 8, maxDurability: 528 })

// Leggings
export const LEATHER_LEGGINGS = define('leather_leggings', { label: 'Leather Leggings', stackSize: 1, color: [160, 101, 64], category: 'armor', armorType: 'leggings', defense: 2, maxDurability: 75 })
export const GOLDEN_LEGGINGS = define('golden_leggings', { label: 'Golden Leggings', stackSize: 1, color: [246, 202, 74], category: 'armor', armorType: 'leggings', defense: 3, maxDurability: 105 })
export const IRON_LEGGINGS = define('iron_leggings', { label: 'Iron Leggings', stackSize: 1, color: [210, 210, 220], category: 'armor', armorType: 'leggings', defense: 5, maxDurability: 225 })
export const DIAMOND_LEGGINGS = define('diamond_leggings', { label: 'Diamond Leggings', stackSize: 1, color: [90, 230, 230], category: 'armor', armorType: 'leggings', defense: 6, maxDurability: 495 })

// Boots
export const LEATHER_BOOTS = define('leather_boots', { label: 'Leather Boots', stackSize: 1, color: [160, 101, 64], category: 'armor', armorType: 'boots', defense: 1, maxDurability: 65 })
export const GOLDEN_BOOTS = define('golden_boots', { label: 'Golden Boots', stackSize: 1, color: [246, 202, 74], category: 'armor', armorType: 'boots', defense: 1, maxDurability: 91 })
export const IRON_BOOTS = define('iron_boots', { label: 'Iron Boots', stackSize: 1, color: [210, 210, 220], category: 'armor', armorType: 'boots', defense: 2, maxDurability: 195 })
export const DIAMOND_BOOTS = define('diamond_boots', { label: 'Diamond Boots', stackSize: 1, color: [90, 230, 230], category: 'armor', armorType: 'boots', defense: 3, maxDurability: 429 })

export const ENDER_CHEST = define('ender_chest', { label: 'Ender Chest', stackSize: 64, color: [35, 20, 45] })

export const WHEAT_SEEDS = defineItem('wheat_seeds', { label: 'Wheat Seeds', stackSize: 64, color: [180, 160, 100] })
export const CARROT_ITEM = defineItem('carrot_item', { label: 'Carrot', stackSize: 64, color: [255, 140, 0], food: 3 })
export const POTATO_ITEM = defineItem('potato_item', { label: 'Potato', stackSize: 64, color: [200, 180, 100], food: 1 })
export const BONE_MEAL = defineItem('bone_meal', { label: 'Bone Meal', stackSize: 64, color: [240, 240, 240] })
export const WHEAT = defineItem('wheat', { label: 'Wheat', stackSize: 64, color: [220, 200, 100] })

export const WOODEN_HOE = define('wooden_hoe', { label: 'Wooden Hoe', stackSize: 1, color: [150, 105, 58], category: 'tool', toolKind: 'hoe', maxDurability: 59 })
export const STONE_HOE = define('stone_hoe', { label: 'Stone Hoe', stackSize: 1, color: [120, 120, 126], category: 'tool', toolKind: 'hoe', maxDurability: 131 })
export const IRON_HOE = define('iron_hoe', { label: 'Iron Hoe', stackSize: 1, color: [210, 210, 220], category: 'tool', toolKind: 'hoe', maxDurability: 250 })
export const GOLDEN_HOE = define('golden_hoe', { label: 'Golden Hoe', stackSize: 1, color: [246, 202, 74], category: 'tool', toolKind: 'hoe', maxDurability: 32 })
export const DIAMOND_HOE = define('diamond_hoe', { label: 'Diamond Hoe', stackSize: 1, color: [90, 230, 230], category: 'tool', toolKind: 'hoe', maxDurability: 1561 })
