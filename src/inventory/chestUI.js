import { SlotController } from './slotController.js'
import { paintIconSlot, createHoverInfo } from './inventoryUI.js'
import { sounds } from '../sounds/soundManager.js'

export class ChestUI {
  constructor(app, inventory) {
    this.app = app
    this.inventory = inventory
    this.chestInventory = null
    this.open = false
    this.slotController = new SlotController(app)
    this.cells = []
    this.onClose = null
    this.onSlotChange = null // callback when any chest slot changes (for multiplayer/local updates)
    this._build()
    this.inventory.onChange(() => this.refresh())
  }

  _build() {
    const overlay = document.createElement('div')
    overlay.id = 'chestoverlay'
    overlay.style.display = 'none'

    const panel = document.createElement('div')
    panel.className = 'mc-inventory mc-chest-panel'

    const title = document.createElement('div')
    title.className = 'mc-table-title'
    title.textContent = 'Chest'
    this.chestTitle = title

    this.hoverInfo = createHoverInfo(panel)

    // Chest slots grid
    const chestGrid = document.createElement('div')
    chestGrid.className = 'mc-inv-grid mc-chest-grid'
    chestGrid.style.marginBottom = '15px'
    this.chestGrid = chestGrid
    this.chestCells = []

    // Player inventory grid (3x9 = 27 slots)
    const invGrid = document.createElement('div')
    invGrid.className = 'mc-inv-grid'
    
    // Player hotbar grid (9 slots)
    const hotbarGrid = document.createElement('div')
    hotbarGrid.className = 'mc-hotbar-grid'
    
    this.invCells = []
    const makeCell = (i, parent) => {
      const cell = document.createElement('div')
      cell.className = 'mc-slot mc-cell'
      cell.dataset.index = String(i)
      parent.appendChild(cell)
      this.invCells[i] = cell
      this.slotController.attachSlot(cell, this._invAccessor(i))
      this.hoverInfo.attach(cell, () => this.inventory.slots[i])
    }

    for (let i = 9; i < this.inventory.size; i++) makeCell(i, invGrid)
    for (let i = 0; i < 9; i++) makeCell(i, hotbarGrid)

    panel.appendChild(title)
    panel.appendChild(chestGrid)
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

  _chestAccessor(i) {
    return {
      get: () => this.chestInventory ? this.chestInventory.slots[i] : null,
      set: (slot) => {
        if (this.chestInventory) {
          this.chestInventory.slots[i] = slot
          if (this.onSlotChange) this.onSlotChange(i, slot)
          this.chestInventory.emit()
        }
      },
      stackSize: (id) => this.inventory.stackSizeOf(id),
      onChange: () => this.refresh(),
      inventoryName: 'chest'
    }
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

  show(chestInventory) {
    this.chestInventory = chestInventory
    // Bind to the chest inventory change event
    this.chestInventoryListener = () => this.refresh()
    this.chestInventory.onChange(this.chestInventoryListener)

    sounds.playChestOpen()

    this.chestTitle.textContent = this.chestInventory.isEnderChest
      ? 'Ender Chest'
      : (this.chestInventory.size === 54 ? 'Large Chest' : 'Chest')

    // Dynamically rebuild chest slots
    this.chestGrid.innerHTML = ''
    this.chestCells = []
    const size = this.chestInventory.size
    for (let i = 0; i < size; i++) {
      const cell = document.createElement('div')
      cell.className = 'mc-slot mc-cell'
      cell.dataset.chestIndex = String(i)
      this.chestGrid.appendChild(cell)
      this.chestCells[i] = cell
      this.slotController.attachSlot(cell, this._chestAccessor(i))
      this.hoverInfo.attach(cell, () => this.chestInventory ? this.chestInventory.slots[i] : null)
    }

    this.open = true
    this.overlay.style.display = 'flex'
    if (document.pointerLockElement) document.exitPointerLock()
    this.refresh()
  }

  close() {
    if (!this.open) return
    this.open = false
    this.overlay.style.display = 'none'
    sounds.playChestClose()
    const leftovers = this.slotController.returnHeldToInventory(this.inventory)
    if (this.onClose) this.onClose(leftovers)
    
    // Clean up chest inventory listener
    if (this.chestInventory && this.chestInventoryListener) {
      const idx = this.chestInventory.listeners.indexOf(this.chestInventoryListener)
      if (idx >= 0) this.chestInventory.listeners.splice(idx, 1)
    }
    this.chestInventory = null
  }

  toggle(chestInventory) {
    if (this.open) this.close()
    else this.show(chestInventory)
  }

  refresh() {
    if (!this.open) return
    for (let i = 0; i < this.chestCells.length; i++) {
      const cell = this.chestCells[i]
      if (!cell) continue
      paintIconSlot(cell, this.chestInventory ? this.chestInventory.slots[i] : null)
    }
    for (let i = 0; i < this.invCells.length; i++) {
      const cell = this.invCells[i]
      if (!cell) continue
      paintIconSlot(cell, this.inventory.slots[i])
    }
  }
}
