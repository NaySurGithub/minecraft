import { CHUNK_SIZE, CHUNK_HEIGHT } from '../config/constants.js'
import { AIR } from '../blocks/registry.js'

export function chunkKey(cx, cz) {
  return cx + ',' + cz
}

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx
    this.cz = cz
    this.voxels = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT)
    this.levels = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT)
    this.dirty = true
    this.mesh = null
    this.transparentMesh = null
    this.generated = false
    this.edits = new Map()
    this.lightMap = null
    this.lightDirty = true
    this.skyMap = null
    this.skyDirty = true
  }

  index(x, y, z) {
    return y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x
  }

  get(x, y, z) {
    if (y < 0 || y >= CHUNK_HEIGHT) return AIR
    return this.voxels[this.index(x, y, z)]
  }

  getLevel(x, y, z) {
    if (y < 0 || y >= CHUNK_HEIGHT) return 0
    return this.levels[this.index(x, y, z)]
  }

  setLevel(x, y, z, n) {
    if (y < 0 || y >= CHUNK_HEIGHT) return
    this.levels[this.index(x, y, z)] = Math.max(0, Math.min(7, n | 0))
    this.dirty = true
  }

  set(x, y, z, id) {
    if (y < 0 || y >= CHUNK_HEIGHT) return
    const idx = this.index(x, y, z)
    this.voxels[idx] = id
    if (id === AIR) this.levels[idx] = 0
    this.dirty = true
    this.lightDirty = true
    this.skyDirty = true
  }

  setEdit(x, y, z, id) {
    if (y < 0 || y >= CHUNK_HEIGHT) return
    const idx = this.index(x, y, z)
    this.voxels[idx] = id
    if (id === AIR) this.levels[idx] = 0
    this.edits.set(idx, id)
    this.dirty = true
    this.lightDirty = true
    this.skyDirty = true
  }

  serializeEdits() {
    const out = []
    for (const [idx, id] of this.edits) {
      out.push(idx, id)
    }
    return out
  }

  applyEdits(flat) {
    for (let i = 0; i < flat.length; i += 2) {
      this.voxels[flat[i]] = flat[i + 1]
      this.edits.set(flat[i], flat[i + 1])
    }
    this.dirty = true
    this.lightDirty = true
    this.skyDirty = true
  }

  // Bulk-replace the entire voxel buffer. Used by clients when receiving a
  // chunk payload from the host so we skip terrain generation entirely.
  loadVoxels(voxels, levels) {
    if (voxels.length !== this.voxels.length) return
    this.voxels.set(voxels)
    if (levels && levels.length === this.levels.length) this.levels.set(levels)
    this.generated = true
    this.dirty = true
    this.lightDirty = true
    this.lightMap = null
    this.skyDirty = true
    this.skyMap = null
  }

  invalidateLightMap() {
    this.lightDirty = true
    this.lightMap = null
  }

  invalidateSkyMap() {
    this.skyDirty = true
    this.skyMap = null
  }
}
