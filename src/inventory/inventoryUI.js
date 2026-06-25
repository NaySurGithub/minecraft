import { AIR, blocks } from '../blocks/registry.js'
import { getThing, items } from '../items/itemRegistry.js'
import { CraftGrid } from './craftGrid.js'
import { SlotController } from './slotController.js'
import { getIconCanvas } from './itemIcons.js'
import { t } from '../ui/translator.js'

export function ensureIconLayer(cell) {
  let icon = cell.querySelector(':scope > .slot-icon')
  let count = cell.querySelector(':scope > .slot-count')
  let durBar = cell.querySelector(':scope > .slot-durability')
  if (!icon) {
    icon = document.createElement('span')
    icon.className = 'slot-icon'
    cell.appendChild(icon)
  }
  if (!count) {
    count = document.createElement('span')
    count.className = 'slot-count'
    cell.appendChild(count)
  }
  if (!durBar) {
    durBar = document.createElement('span')
    durBar.className = 'slot-durability'
    const inner = document.createElement('span')
    inner.className = 'slot-durability-inner'
    durBar.appendChild(inner)
    cell.appendChild(durBar)
  }
  return { icon, count, durBar }
}

export function paintIconSlot(cell, slot) {
  const { icon, count, durBar } = ensureIconLayer(cell)
  if (slot) {
    const nextId = String(slot.id)
    if (cell.dataset.iconId !== nextId) {
      icon.replaceChildren()
      const canvas = getIconCanvas({ id: slot.id })
      if (canvas) icon.appendChild(canvas)
      cell.dataset.iconId = nextId
    }
    count.textContent = slot.count > 1 ? String(slot.count) : ''
    cell.classList.add('filled')

    const thing = getThing(slot.id)
    if (thing && Number.isFinite(thing.maxDurability) && thing.maxDurability > 0) {
      const dur = slot.durability === undefined ? thing.maxDurability : slot.durability
      const pct = Math.max(0, Math.min(100, (dur / thing.maxDurability) * 100))
      if (pct < 100) {
        durBar.style.display = 'block'
        const inner = durBar.querySelector('.slot-durability-inner')
        if (inner) {
          inner.style.width = pct + '%'
          let color = '#55ff55'
          if (pct < 25) color = '#ff2222'
          else if (pct < 50) color = '#ffaa00'
          inner.style.backgroundColor = color
        }
      } else {
        durBar.style.display = 'none'
      }
    } else {
      durBar.style.display = 'none'
    }
  } else {
    if (cell.dataset.iconId !== '') {
      icon.replaceChildren()
      cell.dataset.iconId = ''
    }
    count.textContent = ''
    cell.classList.remove('filled')
    durBar.style.display = 'none'
  }
}

// Creates a hover-info banner appended to `panel` and returns a controller
// with attach(cell, getter) and show(text) — used by InventoryUI,
// CraftingTableUI and FurnaceUI so every slot shows the item name on hover.
export function createHoverInfo(panel) {
  const el = document.createElement('div')
  el.className = 'mc-item-info'
  el.hidden = true
  panel.appendChild(el)

  const show = (text) => {
    const value = String(text || '').trim()
    if (!value) {
      el.textContent = ''
      el.hidden = true
      return
    }
    el.textContent = value
    el.hidden = false
  }

  const attach = (cell, getter) => {
    const reveal = () => {
      const thing = getter()
      if (!thing) { show(''); return }
      const id = thing.id != null ? thing.id : (thing.itemId != null ? thing.itemId : thing.blockId)
      const resolved = id != null ? getThing(id) : null
      const label = (resolved && (resolved.label || resolved.name)) || thing.label || thing.name || ''
      show(label)
    }
    const hide = () => show('')
    cell.addEventListener('mouseenter', reveal)
    cell.addEventListener('focus', reveal)
    cell.addEventListener('mousemove', reveal)
    cell.addEventListener('touchstart', reveal, { passive: true })
    cell.addEventListener('mouseleave', hide)
    cell.addEventListener('blur', hide)
  }

  return { el, show, attach }
}

export class InventoryUI {
  constructor(app, inventory) {
    this.app = app
    this.inventory = inventory
    this.open = false
    this.cells = []
    this.creative = false
    this.creativeCells = []
    // SlotController handles all slot interaction (click pickup, click drop,
    // right-click half-pickup, left/right drag distribute, floating cursor).
    this.slotController = new SlotController(app)
    // Player-inventory crafting is a 2x2 grid. CraftGrid owns the slots, the
    // output preview, and recipe matching; interaction is via SlotController.
    this.grid = new CraftGrid(inventory, 2, {
      onTakeOutput: () => { this._takeOutput() }
    })
    this.hoverInfo = null
    this._build()
    this.inventory.onChange(() => this.refresh())
  }

  _build() {
    const overlay = document.createElement('div')
    overlay.id = 'invoverlay'
    overlay.style.display = 'none'

    const panel = document.createElement('div')
    panel.className = 'mc-inventory'

    const hoverInfo = document.createElement('div')
    hoverInfo.className = 'mc-item-info'
    hoverInfo.hidden = true
    panel.appendChild(hoverInfo)
    this.hoverInfo = hoverInfo

    const top = document.createElement('div')
    top.className = 'mc-top'

    const armor = document.createElement('div')
    armor.className = 'mc-armor'
    const armorTypes = ['helmet', 'chestplate', 'leggings', 'boots']
    for (let i = 0; i < 4; i++) {
      const cell = document.createElement('div')
      cell.className = 'mc-slot mc-cell'
      cell.dataset.armor = armorTypes[i]
      cell.tabIndex = 0
      armor.appendChild(cell)
      const slotIndex = 36 + i
      this.cells[slotIndex] = cell
      this._wireItemInfo(cell, () => this.inventory.slots[slotIndex])
      this.slotController.attachSlot(cell, this._armorAccessor(slotIndex, armorTypes[i]))
    }

    const preview = document.createElement('div')
    preview.className = 'mc-preview'
    const steve = document.createElement('div')
    steve.className = 'mc-steve'
    this.steveParts = {}
    this.steveArmor = {}
    for (const part of ['hair', 'head', 'eye-l', 'eye-r', 'body', 'arm-l', 'arm-r', 'leg-l', 'leg-r']) {
      const d = document.createElement('div')
      d.className = part
      steve.appendChild(d)
      this.steveParts[part] = d
    }
    for (const part of ['helmet', 'chestplate', 'leggings', 'boots']) {
      const d = document.createElement('div')
      d.className = `armor-${part}`
      d.hidden = true
      steve.appendChild(d)
      this.steveArmor[part] = d
    }
    preview.appendChild(steve)

    const offhand = document.createElement('div')
    offhand.className = 'mc-offhand'
    const offSlot = document.createElement('div')
    offSlot.className = 'mc-slot mc-cell'
    offSlot.dataset.armor = 'S'
    offSlot.tabIndex = 0
    offhand.appendChild(offSlot)
    this.cells[40] = offSlot
    this._wireItemInfo(offSlot, () => this.inventory.slots[40])
    this.slotController.attachSlot(offSlot, this._invAccessor(40))

    const crafting = document.createElement('div')
    crafting.className = 'mc-crafting'
    const label = document.createElement('div')
    label.className = 'mc-craft-label'
    label.textContent = t('crafting')
    const craftRow = document.createElement('div')
    craftRow.className = 'mc-craft-row'
    const { gridEl, outCell } = this.grid.build()
    const arrow = document.createElement('div')
    arrow.className = 'mc-arrow'
    craftRow.appendChild(gridEl)
    craftRow.appendChild(arrow)
    craftRow.appendChild(outCell)
    const recipeBook = document.createElement('div')
    recipeBook.className = 'mc-recipe-book'
    recipeBook.title = t('recipeBook')
    crafting.appendChild(label)
    crafting.appendChild(craftRow)
    crafting.appendChild(recipeBook)

    // Attach craft cells to the SlotController.
    for (let i = 0; i < this.grid.cells.length; i++) {
      this.slotController.attachSlot(this.grid.cells[i], this.grid.getAccessor(i))
    }

    top.appendChild(armor)
    top.appendChild(preview)
    top.appendChild(offhand)
    top.appendChild(crafting)

    const invGrid = document.createElement('div')
    invGrid.className = 'mc-inv-grid'
    const hotbarGrid = document.createElement('div')
    hotbarGrid.className = 'mc-hotbar-grid'

    const makeCell = (i, parent) => {
      const cell = document.createElement('div')
      cell.className = 'mc-slot mc-cell'
      cell.dataset.index = String(i)
      cell.tabIndex = 0
      parent.appendChild(cell)
      this.cells[i] = cell
      this._wireItemInfo(cell, () => this.inventory.slots[i], cell)
      this.slotController.attachSlot(cell, this._invAccessor(i))
    }

    // Main grid = storage slots 9..35 (rows above the hotbar)
    for (let i = 9; i < 36; i++) makeCell(i, invGrid)
    // Bottom row = slots 0..8 — the SAME slots the on-screen hotbar shows
    for (let i = 0; i < 9; i++) makeCell(i, hotbarGrid)

    panel.appendChild(top)
    this.creativePanel = this._buildCreativePanel()
    panel.appendChild(this.creativePanel)
    panel.appendChild(invGrid)
    panel.appendChild(hotbarGrid)

    overlay.appendChild(panel)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && this.open) this.toggle()
    })
    this.app.appendChild(overlay)
    this.overlay = overlay

    const openBtn = document.createElement('button')
    openBtn.className = 'mc-open-btn'
    openBtn.textContent = '...'
    openBtn.style.display = 'none'
    openBtn.addEventListener('click', () => this.toggle())
    this.app.appendChild(openBtn)
    this.openBtn = openBtn

    this.refresh()
  }

  _creativeItems() {
    const blockEntries = blocks.filter((b) => b && b.id !== AIR && b.placeable !== false)
    const itemEntries = items.filter(Boolean)
    return blockEntries.concat(itemEntries)
  }

  _buildCreativePanel() {
    const panel = document.createElement('div')
    panel.className = 'mc-creative-panel'
    const tabs = document.createElement('div')
    tabs.className = 'mc-creative-tabs'
    for (const label of ['Blocks', 'Items']) {
      const tab = document.createElement('div')
      tab.className = 'mc-creative-tab'
      tab.textContent = label
      tabs.appendChild(tab)
    }
    const search = document.createElement('input')
    search.type = 'text'
    search.className = 'mc-creative-search'
    search.placeholder = t('search') || 'Search...'
    search.addEventListener('input', () => this._filterCreative(search.value))
    // Stop game keybindings (e.g. inventory/drop keys) from firing while typing.
    search.addEventListener('keydown', (e) => e.stopPropagation())
    this.creativeSearch = search
    const grid = document.createElement('div')
    grid.className = 'mc-creative-grid'
    for (const thing of this._creativeItems()) {
      const cell = document.createElement('button')
      cell.type = 'button'
      cell.className = 'mc-creative-cell'
      cell.title = thing.label || thing.name
      cell.dataset.id = String(thing.id)
      cell.dataset.search = (thing.label || thing.name || '').toLowerCase()
      cell.dataset.itemName = thing.label || thing.name || ''
      cell.title = thing.label || thing.name
      this._wireItemInfo(cell, () => thing, cell)
      const icon = document.createElement('span')
      icon.className = 'mc-creative-icon'
      const canvas = getIconCanvas({ id: thing.id })
      if (canvas) icon.appendChild(canvas)
      const count = document.createElement('span')
      count.className = 'mc-creative-count'
      count.textContent = thing.stackSize === 1 ? '' : String(thing.stackSize || 64)
      cell.appendChild(icon)
      cell.appendChild(count)
      cell.addEventListener('mousedown', (e) => {
        e.preventDefault()
        this.slotController.held = { id: thing.id, count: thing.stackSize || 64 }
        this.slotController._refreshCursor()
        this._showItemInfo(thing.label || thing.name || '')
      })
      grid.appendChild(cell)
      this.creativeCells.push(cell)
    }
    panel.appendChild(tabs)
    panel.appendChild(this.creativeSearch)
    panel.appendChild(grid)
    return panel
  }

  _filterCreative(query) {
    const q = (query || '').trim().toLowerCase()
    for (const cell of this.creativeCells) {
      const name = cell.dataset.search || ''
      cell.style.display = !q || name.includes(q) ? '' : 'none'
    }
  }

  setCreativeMode(enabled) {
    this.creative = !!enabled
    if (this.creativePanel) this.creativePanel.style.display = this.creative ? 'block' : 'none'
  }

  _invAccessor(i, accepts = null) {
    return {
      get: () => this.inventory.slots[i],
      set: (slot) => { this.inventory.slots[i] = slot },
      stackSize: (id) => this.inventory.stackSizeOf(id),
      onChange: () => this.inventory.emit(),
      accepts,
      inventoryName: 'player_inventory'
    }
  }

  _armorAccessor(i, armorType) {
    return this._invAccessor(i, (slot) => {
      if (!slot || !slot.id) return true
      const thing = getThing(slot.id)
      return !!thing && thing.category === 'armor' && thing.armorType === armorType
    })
  }

  _wireItemInfo(cell, getter) {
    const show = () => {
      const thing = getter()
      this._showItemInfo(thing ? (thing.label || thing.name || '') : '')
    }
    cell.addEventListener('mouseenter', show)
    cell.addEventListener('focus', show)
    cell.addEventListener('click', show)
    cell.addEventListener('touchstart', show, { passive: true })
    cell.addEventListener('mouseleave', () => this._showItemInfo(''))
    cell.addEventListener('blur', () => this._showItemInfo(''))
  }

  _showItemInfo(text) {
    if (!this.hoverInfo) return
    const value = String(text || '').trim()
    if (!value) {
      this.hoverInfo.textContent = ''
      this.hoverInfo.hidden = true
      return
    }
    this.hoverInfo.textContent = value
    this.hoverInfo.hidden = false
  }

  setTouchMode(enabled) {
    if (this.openBtn) this.openBtn.style.display = enabled ? 'flex' : 'none'
  }

  _takeOutput() {
    if (this.grid.takeOutput()) this.refresh()
  }

  toggle() {
    if (!this.open) {
      const overlays = ['#chestoverlay', '#tableoverlay', '#furnaceoverlay']
      for (const selector of overlays) {
        const el = this.app.querySelector(selector)
        if (el && el.style.display === 'flex') {
          return
        }
      }
    }
    this.open = !this.open
    this.overlay.style.display = this.open ? 'flex' : 'none'
    if (this.open && document.pointerLockElement) document.exitPointerLock()
    if (!this.open) {
      // Return any held cursor stack to inventory; leftovers drop on the floor
      // — main.js can hook this if it wants entities, for now it just stays.
      this.slotController.returnHeldToInventory(this.inventory)
      // Drain craft grid back to inventory so items aren't lost when closing.
      this.grid.drainToInventory()
    }
  }

  refresh() {
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]
      if (!cell) continue
      paintIconSlot(cell, this.inventory.slots[i])
    }
    this._updateSteveArmorPreview()
    this.grid.paint()
  }

  _updateSteveArmorPreview() {
    if (!this.steveArmor) return
    const equipped = {
      helmet: getThing(this.inventory.slots[36]?.id),
      chestplate: getThing(this.inventory.slots[37]?.id),
      leggings: getThing(this.inventory.slots[38]?.id),
      boots: getThing(this.inventory.slots[39]?.id)
    }
    for (const [part, el] of Object.entries(this.steveArmor)) {
      const thing = equipped[part]
      const color = thing?.color
      if (thing && thing.category === 'armor' && Array.isArray(color)) {
        el.hidden = false
        el.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`
      } else {
        el.hidden = true
      }
    }
  }
}
