import { blocks } from '../blocks/registry.js'
import { matchRecipe, recipeYield, consumeOneCraft } from './recipes.js'
import { paintIconSlot } from './inventoryUI.js'

// Reusable N x N crafting grid: owns its slot array, its DOM cells, and the
// output preview cell. Slot interaction (click, drag, distribute) is handled
// externally by a SlotController — the host UI attaches each cell to the
// controller via the accessors exposed by getAccessor(i). The only direct
// listener owned here is the output cell click, since that's a one-shot
// 'take crafted item' action, not a slot interaction.
export class CraftGrid {
  constructor(inventory, size, hooks) {
    this.inventory = inventory
    this.size = size
    this.slots = new Array(size * size).fill(null)
    this.out = null
    this.cells = []
    this.outCell = null
    this.hooks = hooks || {}
  }

  build() {
    const grid = document.createElement('div')
    grid.className = 'mc-craft-grid'
    grid.style.gridTemplateColumns = 'repeat(' + this.size + ', 1fr)'
    for (let i = 0; i < this.slots.length; i++) {
      const s = document.createElement('div')
      s.className = 'mc-slot'
      s.dataset.craft = String(i)
      grid.appendChild(s)
      this.cells[i] = s
    }

    const out = document.createElement('div')
    out.className = 'mc-slot mc-craft-out'
    out.addEventListener('click', () => {
      if (this.hooks.onTakeOutput) this.hooks.onTakeOutput()
    })
    this.outCell = out

    return { gridEl: grid, outCell: out }
  }

  // Accessor for SlotController: lets it read/write this grid's slots and get
  // notified when something changes so it can repaint + recompute.
  getAccessor(i) {
    return {
      get: () => this.slots[i],
      set: (slot) => { this.slots[i] = slot },
      stackSize: (id) => this.inventory.stackSizeOf(id),
      onChange: () => {
        this.recomputeOutput()
        this.paint()
      }
    }
  }

  recomputeOutput() {
    const recipe = matchRecipe(this.slots, this.size)
    this.out = recipe ? { id: recipe.out.id, count: recipe.out.count } : null
  }

  takeOutput() {
    const y = recipeYield(this.slots, this.size)
    if (!y) return false
    if (!this._hasRoomFor(y.id, y.count)) return false
    if (!consumeOneCraft(this.slots, this.size)) return false
    this.inventory.addItem(y.id, y.count)
    this.recomputeOutput()
    return true
  }

  _hasRoomFor(id, count) {
    const max = this.inventory.stackSizeOf(id)
    let room = 0
    for (let i = 0; i < this.inventory.size; i++) {
      const slot = this.inventory.slots[i]
      if (!slot) room += max
      else if (slot.id === id && slot.count < max) room += max - slot.count
      if (room >= count) return true
    }
    return room >= count
  }

  drainToInventory() {
    const leftovers = []
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]
      if (!s) continue
      const remaining = this.inventory.addItem(s.id, s.count)
      if (remaining > 0) leftovers.push({ id: s.id, count: remaining })
      this.slots[i] = null
    }
    this.out = null
    return leftovers
  }

  paint() {
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]
      if (!cell) continue
      paintIconSlot(cell, this.slots[i])
    }
    if (this.outCell) {
      paintIconSlot(this.outCell, this.out)
    }
  }
}
