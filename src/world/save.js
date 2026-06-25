import { SAVE_PREFIX, SAVE_INDEX } from '../config/constants.js'
import { chunkKey } from './chunk.js'
import { Inventory } from '../inventory/inventory.js'

function readIndex() {
  try {
    const raw = localStorage.getItem(SAVE_INDEX)
    return raw ? JSON.parse(raw) : []
  } catch (e) {
    return []
  }
}

function writeIndex(index) {
  localStorage.setItem(SAVE_INDEX, JSON.stringify(index))
}

export function listWorlds() {
  return readIndex()
}

export function deleteWorld(id) {
  const index = readIndex().filter((w) => w.id !== id)
  writeIndex(index)
  localStorage.removeItem(SAVE_PREFIX + id)
}

export function renameWorld(id, name) {
  const index = readIndex()
  const item = index.find((w) => w.id === id)
  if (!item) return false
  item.name = name
  writeIndex(index)
  const data = loadWorldData(id)
  if (data) {
    data.name = name
    localStorage.setItem(SAVE_PREFIX + id, JSON.stringify(data))
  }
  return true
}

export function worldExists(id) {
  return readIndex().some((w) => w.id === id)
}

export function collectEdits(world) {
  if (!world || !world.chunks) return {}
  const edits = {}
  for (const [key, chunk] of world.chunks) {
    if (chunk.edits && chunk.edits.size > 0) {
      edits[key] = chunk.serializeEdits()
    }
  }
  return edits
}

export function saveWorld(meta, world, player, inventory, health, dropManager, mobManager, effectsManager) {
  const id = meta.id
  const now = new Date().toISOString()

  // Serialize active effects (strip internal timer state, keep only what's needed to restore)
  const effectsData = effectsManager?.effects
    ? effectsManager.effects
        .filter(e => e.remaining > 0)
        .map(e => ({ id: e.id, remaining: e.remaining, magnitude: e.magnitude }))
    : (meta.effects || [])

  const data = {
    id,
    name: meta.name,
    seed: meta.seed,
    gameMode: meta.gameMode,
    defaultGameMode: meta.defaultGameMode || meta.gameMode,
    multiplayerRoomCode: meta.multiplayerRoomCode || null,
    mods: meta.mods || [],
    keepInventory: !!meta.keepInventory,
    createdAt: meta.createdAt || now,
    openedAt: now,
    playerPos: player?.position ? { x: player.position.x, y: player.position.y, z: player.position.z } : (meta.playerPos || { x: 0, y: 80, z: 0 }),
    yaw: player?.yaw ?? meta.yaw ?? 0,
    pitch: player?.pitch ?? meta.pitch ?? 0,
    inventory: inventory?.serialize ? inventory.serialize() : (meta.inventory || []),
    health: health?.serialize ? health.serialize() : (meta.health || null),
    hunger: health?.hunger == null ? (meta.hunger == null ? 20 : meta.hunger) : health.hunger,
    timeOfDay: meta.timeOfDay == null ? 0 : meta.timeOfDay,
    weather: meta.weather || 'clear',
    weatherTimer: meta.weatherTimer == null ? 0 : meta.weatherTimer,
    difficulty: meta.difficulty || 'normal',
    dimension: meta.dimension || world?.dimension || 'overworld',
    achievements: meta.achievements || { stats: {}, unlocked: [] },
    edits: collectEdits(world),
    tileEntities: world?.serializeTileEntities ? world.serializeTileEntities() : {},
    chests: world?.chests ? Object.fromEntries(Array.from(world.chests.entries()).map(([k, inv]) => [k, { slots: inv.serialize(), facing: inv.facing }])) : {},
    enderChests: world?.enderChests ? Object.fromEntries(Array.from(world.enderChests.entries()).map(([k, inv]) => [k, inv.serialize()])) : {},
    drops: dropManager?.serialize ? dropManager.serialize() : (meta.drops || []),
    mobs: mobManager?.serialize ? mobManager.serialize() : (meta.mobs || []),
    dimensions: meta.dimensions || {},
    effects: effectsData,
    savedAt: now
  }
  localStorage.setItem(SAVE_PREFIX + id, JSON.stringify(data))
  const index = readIndex()
  const existing = index.findIndex((w) => w.id === id)
  const summary = {
    id,
    name: meta.name,
    seed: meta.seed,
    gameMode: meta.gameMode,
    defaultGameMode: data.defaultGameMode,
    multiplayerRoomCode: data.multiplayerRoomCode,
    mods: data.mods || [],
    keepInventory: !!data.keepInventory,
    weather: data.weather,
    weatherTimer: data.weatherTimer,
    difficulty: data.difficulty,
    dimension: data.dimension,
    achievements: data.achievements,
    createdAt: data.createdAt,
    openedAt: data.openedAt,
    savedAt: data.savedAt
  }
  if (existing >= 0) index[existing] = summary
  else index.push(summary)
  writeIndex(index)
  return data
}

export function loadWorldData(id) {
  try {
    const raw = localStorage.getItem(SAVE_PREFIX + id)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
}

export function applyEditsToWorld(world, edits) {
  if (!edits) return
  for (const key of Object.keys(edits)) {
    const parts = key.split(',')
    const cx = parseInt(parts[0], 10)
    const cz = parseInt(parts[1], 10)
    const chunk = world.ensureChunk(cx, cz)
    chunk.applyEdits(edits[key])
    chunk.dirty = true
  }
}

export function applyChestsToWorld(world, chests) {
  if (!world) return
  world.chests = new Map()
  if (!chests) return
  for (const [k, v] of Object.entries(chests)) {
    const inv = new Inventory(27)
    if (v && v.slots) {
      inv.load(v.slots)
      inv.facing = v.facing
    } else {
      inv.load(v)
    }
    const parts = k.split(',').map((p) => Number(p))
    if (parts.length === 3 && parts.every(Number.isFinite) && typeof world.setTileEntityFromData === 'function') {
      const entity = world.setTileEntityFromData({
        type: 'chest',
        x: parts[0],
        y: parts[1],
        z: parts[2],
        slots: inv.serialize(),
        facing: inv.facing || 'south'
      })
      if (entity?.inventory) {
        world.chests.set(k, entity.inventory)
        continue
      }
    }
    world.chests.set(k, inv)
  }
}

export function applyEnderChestsToWorld(world, enderChests) {
  if (!world) return
  world.enderChests = new Map()
  if (!enderChests) return
  for (const [k, v] of Object.entries(enderChests)) {
    const inv = new Inventory(27)
    inv.load(v)
    inv.isEnderChest = true
    world.enderChests.set(k, inv)
  }
}

export function applyTileEntitiesToWorld(world, tileEntities) {
  if (!world || !tileEntities) return
  const entries = Array.isArray(tileEntities) ? tileEntities : Object.values(tileEntities)
  if (!entries.length) return
  if (typeof world.loadTileEntities === 'function') {
    world.loadTileEntities(tileEntities)
    return
  }
  if (typeof world.setTileEntityFromData !== 'function') return
  for (const data of entries) world.setTileEntityFromData(data)
}

export function exportNzLevel(meta, world, player, inventory, health, dropManager, mobManager) {
  const payload = saveWorld(meta, world, player, inventory, health, dropManager, mobManager)
  payload.format = 'nzlevel'
  payload.version = 1
  return payload
}

export function importNzLevel(data) {
  if (!data || data.format !== 'nzlevel') return null
  return data
}

export function toNzLevelFileName(meta) {
  const base = (meta?.name || meta?.id || 'world').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '')
  return (base || 'world') + '.nzlevel'
}
