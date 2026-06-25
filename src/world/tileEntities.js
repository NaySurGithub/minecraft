import { Inventory } from '../inventory/inventory.js'

export function tileEntityKey(x, y, z) {
  return `${x},${y},${z}`
}

export class TileEntity {
  constructor(type, x, y, z) {
    this.type = type
    this.x = x
    this.y = y
    this.z = z
  }

  tick(_dt, _world, _context = {}) {}

  serialize() {
    return {
      type: this.type,
      x: this.x,
      y: this.y,
      z: this.z
    }
  }

  load(data = {}) {
    if (Number.isFinite(data.x)) this.x = data.x
    if (Number.isFinite(data.y)) this.y = data.y
    if (Number.isFinite(data.z)) this.z = data.z
  }
}

export class ContainerTileEntity extends TileEntity {
  constructor(type, x, y, z, slots = 27) {
    super(type, x, y, z)
    this.inventory = new Inventory(slots)
    this.facing = 'south'
    this.openCount = 0
  }

  serialize() {
    this.facing = this.inventory.facing || this.facing || 'south'
    return {
      ...super.serialize(),
      slots: this.inventory.serialize(),
      facing: this.facing,
      openCount: this.openCount
    }
  }

  load(data = {}) {
    super.load(data)
    if (Array.isArray(data.slots)) this.inventory.load(data.slots)
    if (data.facing) this.facing = data.facing
    this.inventory.facing = this.facing
    this.openCount = Math.max(0, Number(data.openCount) || 0)
  }
}

export class ChestTileEntity extends ContainerTileEntity {
  constructor(x, y, z) {
    super('chest', x, y, z, 27)
  }
}

export class EnderChestTileEntity extends TileEntity {
  constructor(x, y, z) {
    super('ender_chest', x, y, z)
    this.openCount = 0
  }

  serialize() {
    return { ...super.serialize(), openCount: this.openCount }
  }

  load(data = {}) {
    super.load(data)
    this.openCount = Math.max(0, Number(data.openCount) || 0)
  }
}

export class FurnaceTileEntity extends ContainerTileEntity {
  constructor(x, y, z) {
    super('furnace', x, y, z, 3)
    this.burnTime = 0
    this.cookTime = 0
  }

  tick(dt) {
    if (this.burnTime > 0) this.burnTime = Math.max(0, this.burnTime - dt)
  }

  serialize() {
    return {
      ...super.serialize(),
      burnTime: this.burnTime,
      cookTime: this.cookTime
    }
  }

  load(data = {}) {
    super.load(data)
    this.burnTime = Math.max(0, Number(data.burnTime) || 0)
    this.cookTime = Math.max(0, Number(data.cookTime) || 0)
  }
}

export class SpawnerTileEntity extends TileEntity {
  constructor(x, y, z) {
    super('spawner', x, y, z)
    this.mobType = 'zombie'
    this.cooldown = 10
  }

  tick(dt, world, context = {}) {
    if (!context.mobManager || !world) return
    this.cooldown -= dt
    if (this.cooldown > 0) return
    this.cooldown = 10 + Math.random() * 10
    const sx = this.x + 0.5
    const sy = this.y + 1
    const sz = this.z + 0.5
    if (world.isPassable(Math.floor(sx), Math.floor(sy), Math.floor(sz))) {
      context.mobManager.spawn(this.mobType, sx, sy, sz)
    }
  }

  serialize() {
    return {
      ...super.serialize(),
      mobType: this.mobType,
      cooldown: this.cooldown
    }
  }

  load(data = {}) {
    super.load(data)
    if (data.mobType) this.mobType = String(data.mobType)
    this.cooldown = Math.max(0.5, Number(data.cooldown) || 10)
  }
}

export class MusicBlockTileEntity extends TileEntity {
  constructor(x, y, z) {
    super('music_block', x, y, z)
    this.note = 0
    this.instrument = 'harp'
  }

  serialize() {
    return {
      ...super.serialize(),
      note: this.note,
      instrument: this.instrument
    }
  }

  load(data = {}) {
    super.load(data)
    this.note = ((Math.floor(Number(data.note) || 0) % 25) + 25) % 25
    if (data.instrument) this.instrument = String(data.instrument)
  }
}

export function createTileEntityForBlock(blockName, x, y, z) {
  if (blockName === 'chest') return new ChestTileEntity(x, y, z)
  if (blockName === 'ender_chest') return new EnderChestTileEntity(x, y, z)
  if (blockName === 'furnace') return new FurnaceTileEntity(x, y, z)
  if (blockName === 'spawner' || blockName === 'mob_spawner') return new SpawnerTileEntity(x, y, z)
  if (blockName === 'music_block' || blockName === 'note_block' || blockName === 'noteblock') return new MusicBlockTileEntity(x, y, z)
  return null
}

export function createTileEntityFromData(data) {
  if (!data || !data.type) return null
  const type = String(data.type)
  let entity = null
  if (type === 'chest') entity = new ChestTileEntity(data.x, data.y, data.z)
  else if (type === 'ender_chest') entity = new EnderChestTileEntity(data.x, data.y, data.z)
  else if (type === 'furnace') entity = new FurnaceTileEntity(data.x, data.y, data.z)
  else if (type === 'spawner') entity = new SpawnerTileEntity(data.x, data.y, data.z)
  else if (type === 'music_block' || type === 'note_block' || type === 'noteblock') entity = new MusicBlockTileEntity(data.x, data.y, data.z)
  if (!entity) return null
  entity.load(data)
  return entity
}
