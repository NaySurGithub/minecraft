import { blocks } from '../blocks/registry.js'
import { CraftGrid } from './craftGrid.js'
import { SlotController } from './slotController.js'
import { paintIconSlot, createHoverInfo } from './inventoryUI.js'
import { t } from '../ui/translator.js'

// Standalone UI for a placed crafting table. Standard Minecraft layout:
// a 3x3 craft grid -> arrow -> output cell on top, then the player's storage
// rows, then the hotbar row along the bottom. All slot interaction goes through
// SlotController so click-to-pick-up and drag-distribute behave identically to
// InventoryUI. No recipe-book sidebar — just the rectangular crafting panel.
export class CraftingTableUI {
  constructor(app, inventory) {
    this.app = app
    this.inventory = inventory
    this.open = false
    this.cells = []
    this.onClose = null
    this.slotController = new SlotController(app)
    this.grid = new CraftGrid(inventory, 3, {
      onTakeOutput: () => { this._takeOutput() }
    })
    this._build()
    this.inventory.onChange(() => this.refresh())
  }

  _build() {
    const overlay = document.createElement('div')
    overlay.id = 'tableoverlay'
    overlay.className = 'mc-overlay'
    overlay.style.display = 'none'

    const panel = document.createElement('div')
    panel.className = 'mc-inventory mc-table-panel'

    const title = document.createElement('div')
    title.className = 'mc-table-title'
    title.textContent = t('craftingTable')

    this.hoverInfo = createHoverInfo(panel)

    // Top section: 3x3 grid -> arrow -> output
    const craftRow = document.createElement('div')
    craftRow.className = 'mc-craft-row'
    const { gridEl, outCell } = this.grid.build()
    gridEl.classList.add('mc-craft-grid-3')
    const arrow = document.createElement('div')
    arrow.className = 'mc-arrow'
    craftRow.appendChild(gridEl)
    craftRow.appendChild(arrow)
    craftRow.appendChild(outCell)

    for (let i = 0; i < this.grid.cells.length; i++) {
      this.slotController.attachSlot(this.grid.cells[i], this.grid.getAccessor(i))
      const idx = i
      this.hoverInfo.attach(this.grid.cells[i], () => this.grid.slots[idx])
    }
    this.hoverInfo.attach(outCell, () => this.grid.out)

    // Inventory + hotbar rows
    const invGrid = document.createElement('div')
    invGrid.className = 'mc-inv-grid'
    const hotbarGrid = document.createElement('div')
    hotbarGrid.className = 'mc-hotbar-grid'

    const makeCell = (i, parent) => {
      const cell = document.createElement('div')
      cell.className = 'mc-slot mc-cell'
      cell.dataset.index = String(i)
      parent.appendChild(cell)
      this.cells[i] = cell
      this.slotController.attachSlot(cell, this._invAccessor(i))
      this.hoverInfo.attach(cell, () => this.inventory.slots[i])
    }

    for (let i = 9; i < this.inventory.size; i++) makeCell(i, invGrid)
    for (let i = 0; i < 9; i++) makeCell(i, hotbarGrid)

    panel.appendChild(title)
    panel.appendChild(craftRow)
    panel.appendChild(invGrid)
    panel.appendChild(hotbarGrid)

    overlay.appendChild(panel)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && this.open) this.close()
    })
    this.app.appendChild(overlay)
    this.overlay = overlay

    this.refresh()
  }

  _invAccessor(i) {
    return {
      get: () => this.inventory.slots[i],
      set: (slot) => { this.inventory.slots[i] = slot },
      stackSize: (id) => this.inventory.stackSizeOf(id),
      onChange: () => this.inventory.emit(),
      inventoryName: 'player_inventory'
    }
  }

  _takeOutput() {
    if (this.grid.takeOutput()) this.refresh()
  }

  show() {
    if (this.open) return
    this.open = true
    this.overlay.style.display = 'flex'
    if (document.pointerLockElement) document.exitPointerLock()
    this.grid.recomputeOutput()
    this.refresh()
  }

  // Close + drain. Returns leftover items (those that didn't fit in inventory)
  // so the caller can drop them at the player's feet. Also returns whatever
  // was on the cursor.
  close() {
    if (!this.open) return []
    this.open = false
    this.overlay.style.display = 'none'
    const heldLeftovers = this.slotController.returnHeldToInventory(this.inventory)
    const gridLeftovers = this.grid.drainToInventory()
    const leftovers = heldLeftovers.concat(gridLeftovers)
    this.refresh()
    if (this.onClose) this.onClose(leftovers)
    return leftovers
  }

  toggle() {
    if (this.open) this.close()
    else this.show()
  }

  refresh() {
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]
      if (!cell) continue
      paintIconSlot(cell, this.inventory.slots[i])
    }
    this.grid.paint()
  }
}
