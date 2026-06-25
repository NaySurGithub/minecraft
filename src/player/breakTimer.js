import { AIR, blocks } from '../blocks/registry.js'
import { getThing } from '../items/itemRegistry.js'

export class BreakTimer {
  constructor(world, player, raycastFn) {
    this.world = world
    this.player = player
    this.raycast = raycastFn
    this.gamemode = null
    this.held = false
    this.active = false
    this.target = null
    this.progress = 0
    this.required = 0
    this.lastTickAt = 0
    this.onBroken = null
    this.onProgress = null
    this.cooldown = 0
    this.effectsManager = null  // injected from main.js
  }

  setGamemode(gm) {
    this.gamemode = gm
  }

  _hardnessOf(id) {
    const def = blocks[id]
    if (!def) return null
    if (def.hardness == null || Number.isNaN(def.hardness)) return null
    return def.hardness
  }

  _heldTool() {
    const stack = this.player?.hotbar?.selectedStack?.()
    if (!stack) return null
    return getThing(stack.id) || null
  }

  _toolMatches(blockId) {
    const def = blocks[blockId]
    if (!def) return false
    if (!def.tool) return true
    const tool = this._heldTool()
    if (!tool) return false
    if (tool.category !== 'tool') return false
    return tool.toolKind === def.tool || (def.tool === 'pickaxe' && tool.toolKind === 'pickaxe')
  }

  _handSpeedMultiplier(def, hardness) {
    if (!def) return 1
    if (def.name === 'glass') return hardness / 0.75
    if (def.tool === 'shovel') {
      return hardness / 0.75
    }
    if (def.tool === 'axe') {
      return hardness / 3.0
    }
    if (def.tool === 'pickaxe') return 0.015
    if (def.tool) return 0.025
    return 0.02
  }

  _speedMultiplier(blockId) {
    const def = blocks[blockId]
    const hardness = def && Number.isFinite(def.hardness) ? def.hardness : 1
    if (!def) return 1
    const tool = this._heldTool()
    if (!tool || tool.category !== 'tool') return this._handSpeedMultiplier(def, hardness)
    if (tool.toolKind === 'pickaxe') {
      if (def.tool === 'pickaxe') {
        if (tool.name.startsWith('diamond_')) return 8
        if (tool.name.startsWith('iron_')) return 5
        if (tool.name.startsWith('golden_')) return 4
        if (tool.name.startsWith('stone_')) return 3
        return 2
      }
      return this._handSpeedMultiplier(def, hardness)
    }
    if (tool.toolKind === 'shovel' && def.tool === 'shovel') {
      return 999.0 // Instant break / One-shot
    }
    if (tool.toolKind === def.tool) return 1.75
    return this._handSpeedMultiplier(def, hardness)
  }

  _currentHit() {
    return this.raycast(this.world, this.player.getEye(), this.player.getForward())
  }

  _sameTarget(a, b) {
    if (!a || !b) return false
    return a.x === b.x && a.y === b.y && a.z === b.z
  }

  start() {
    this.held = true
    this._acquire()
  }

  _acquire() {
    const hit = this._currentHit()
    if (!hit) { this.active = false; this.target = null; return }
    const id = this.world.getBlock(hit.block.x, hit.block.y, hit.block.z)
    if (id === AIR) { this.active = false; this.target = null; return }
    const hardness = this._hardnessOf(id)

    this.active = true
    this.target = { x: hit.block.x, y: hit.block.y, z: hit.block.z, id }
    this.progress = 0
    this.required = hardness == null ? 1 : hardness
    this.lastTickAt = performance.now()

    if (this.gamemode && this.gamemode.instantBreak()) {
      this._break()
      return
    }
  }

  stop() {
    this.held = false
    this._reset()
  }

  _reset() {
    this.active = false
    this.target = null
    this.progress = 0
    this.required = 0
    if (this.onProgress) this.onProgress(0, null)
  }

  _break() {
    const t = this.target
    if (!t) return
    const id = this.world.getBlock(t.x, t.y, t.z)
    if (id !== AIR && id === t.id) {
      // Durability check
      const stack = this.player?.hotbar?.selectedStack?.()
      if (stack) {
        const itemDef = getThing(stack.id)
        if (itemDef && itemDef.maxDurability) {
          if (stack.durability === undefined) {
            stack.durability = itemDef.maxDurability
          }
          stack.durability--
          if (stack.durability <= 0) {
            // Remove tool
            if (this.player.hotbar && typeof this.player.hotbar.selectedIndex === 'number') {
              this.player.hotbar.setSlot?.(this.player.hotbar.selectedIndex, null)
            }
          } else {
            this.player.hotbar.onChange?.()
          }
        }
      }

      this.world.setBlock(t.x, t.y, t.z, AIR)
      if (this.onBroken) this.onBroken(t.x, t.y, t.z, id)
    }
    this.cooldown = 0.25
    this._reset()
    if (this.held) this._acquire()
  }

  update(dt) {
    if (this.cooldown > 0) {
      this.cooldown -= dt
      return
    }
    if (!this.held && !this.active) return
    if (!this.active || !this.target) {
      if (this.held) this._acquire()
      return
    }

    const hit = this._currentHit()
    if (!hit || !this._sameTarget(hit.block, this.target)) {
      this._reset()
      if (this.held) this._acquire()
      return
    }

    const id = this.world.getBlock(this.target.x, this.target.y, this.target.z)
    if (id !== this.target.id) {
      this._reset()
      if (this.held) this._acquire()
      return
    }

    const effectsMult = this.effectsManager ? this.effectsManager.getBreakSpeedMult() : 1
    const mult = (this.gamemode ? this.gamemode.breakSpeedMultiplier() : 1) * this._speedMultiplier(id) * effectsMult
    this.progress += dt * mult

    if (this.onProgress) {

    const def = blocks[id]
   

      const ratio = this.required > 0 ? Math.min(1, this.progress / this.required) : 1
      this.onProgress(ratio, this.target)
    }

    if (this.progress >= this.required) {
      this._break()
      return
    }
  }
}
