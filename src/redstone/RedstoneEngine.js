import { computePower, MAX_POWER, parseKey } from './powerGraph.js'
import { createComponents } from './components.js'

// Throttled redstone engine. Hooks the existing game loop via update(dt) but
// only runs a propagation pass at a fixed tick rate (10 Hz, matching
// Minecraft's redstone tick) and only when something changed (dirty flag).
//
// Responsibilities:
//   - track placed redstone components and lever on/off state
//   - compute power propagation via the pure powerGraph BFS
//   - apply effects: swap redstone_lamp <-> redstone_lamp_lit when powered
//
// The engine takes the world as its only hard dependency and resolves block
// ids by name through components, so it stays decoupled from main.js state.

const TICK_INTERVAL = 0.1 // seconds -> 10 Hz

export class RedstoneEngine {
  constructor(world) {
    this.world = world
    this.components = createComponents()
    // Set of "x,y,z" keys for every redstone-relevant block currently placed.
    this.tracked = new Set()
    // Lever toggle state: "x,y,z" -> bool (on).
    this.leverState = new Map()
    // Last computed power per cell, so we only rewrite blocks that changed.
    this.lastPower = new Map()
    this._acc = 0
    this._dirty = false
  }

  _key(x, y, z) {
    return x + ',' + y + ',' + z
  }

  // Called from main.js whenever a block is placed or removed at (x,y,z).
  onBlockChanged(x, y, z) {
    const id = this.world.getBlock(x, y, z)
    const k = this._key(x, y, z)
    if (this.components.isRedstoneComponent(id)) {
      this.tracked.add(k)
    } else {
      this.tracked.delete(k)
      this.leverState.delete(k)
    }
    this._dirty = true
  }

  // Toggle a lever at (x,y,z); returns the new on/off state (or null if no lever).
  toggleLever(x, y, z) {
    const id = this.world.getBlock(x, y, z)
    if (!this.components.isToggleSource(id)) return null
    const k = this._key(x, y, z)
    const next = !this.leverState.get(k)
    this.leverState.set(k, next)
    this._dirty = true
    return next
  }

  update(dt) {
    this._acc += dt
    if (this._acc < TICK_INTERVAL) return
    this._acc = 0
    if (!this._dirty) return
    this._dirty = false
    this._propagate()
  }

  _propagate() {
    const world = this.world
    const comp = this.components

    // Gather active sources: constant emitters + levers toggled on.
    const sources = []
    for (const k of this.tracked) {
      const { x, y, z } = parseKey(k)
      const id = world.getBlock(x, y, z)
      if (comp.isConstantSource(id)) {
        sources.push({ x, y, z })
      } else if (comp.isToggleSource(id) && this.leverState.get(k)) {
        sources.push({ x, y, z })
      }
    }

    const isConductor = (x, y, z) => comp.isConductor(world.getBlock(x, y, z))
    const power = computePower({ sources, isConductor })

    // Apply reactor effects. A reactor is powered if any neighbor (or itself)
    // carries power > 0, or it's adjacent to an active source.
    const poweredSet = new Set(power.keys())
    for (const { x, y, z } of sources) poweredSet.add(this._key(x, y, z))

    for (const k of this.tracked) {
      const { x, y, z } = parseKey(k)
      const id = world.getBlock(x, y, z)
      if (!comp.isReactor(id) && id !== comp.ids.redstoneLamp && id !== comp.ids.redstoneLampLit) continue
      const powered = this._isPoweredNear(x, y, z, poweredSet)
      this._applyReactor(x, y, z, id, powered)
    }

    this.lastPower = power
  }

  _isPoweredNear(x, y, z, poweredSet) {
    if (poweredSet.has(this._key(x, y, z))) return true
    const n = [
      [1, 0, 0], [-1, 0, 0],
      [0, 1, 0], [0, -1, 0],
      [0, 0, 1], [0, 0, -1]
    ]
    for (const [dx, dy, dz] of n) {
      if (poweredSet.has(this._key(x + dx, y + dy, z + dz))) return true
    }
    return false
  }

  _applyReactor(x, y, z, id, powered) {
    const ids = this.components.ids
    // Redstone lamp block-swap: lamp <-> lit variant.
    if (id === ids.redstoneLamp && powered) {
      this.world.setBlock(x, y, z, ids.redstoneLampLit)
      this.tracked.add(this._key(x, y, z))
    } else if (id === ids.redstoneLampLit && !powered) {
      this.world.setBlock(x, y, z, ids.redstoneLamp)
      const k = this._key(x, y, z)
      this.tracked.add(k)
    }
  }
}
