import { getThing } from '../items/itemRegistry.js'
import { getIconCanvas } from '../inventory/itemIcons.js'

function ensureDurabilityLayer(cell) {
  let bar = cell.querySelector(':scope > .slot-durability')
  if (!bar) {
    bar = document.createElement('span')
    bar.className = 'slot-durability'
    const inner = document.createElement('span')
    inner.className = 'slot-durability-inner'
    bar.appendChild(inner)
    cell.appendChild(bar)
  }
  return bar
}

const HOTBAR_SIZE = 9

export class Hotbar {
  constructor(app, inventory, onOpenInventory) {
    this.app = app
    this.inventory = inventory
    this.size = HOTBAR_SIZE
    this.selected = 0
    this.onOpenInventory = onOpenInventory || null
    this.cells = []
    this._build()
    this._bind()
    this.inventory.onChange(() => this.refresh())
  }

  _build() {
    const bar = document.createElement('div')
    bar.id = 'hotbar'
    for (let i = 0; i < this.size; i++) {
      const cell = document.createElement('div')
      cell.className = 'slot'
      cell.dataset.index = String(i)
      const iconWrap = document.createElement('span')
      iconWrap.className = 'slot-icon'
      const count = document.createElement('span')
      count.className = 'slot-count'
      const durability = document.createElement('span')
      durability.className = 'slot-durability'
      const inner = document.createElement('span')
      inner.className = 'slot-durability-inner'
      durability.appendChild(inner)
      cell.appendChild(iconWrap)
      cell.appendChild(count)
      cell.appendChild(durability)
      cell.addEventListener('click', () => this.select(i))
      bar.appendChild(cell)
      this.cells.push({ cell, iconWrap, count, durability, currentIconId: null })
    }
    this.app.appendChild(bar)
    this.bar = bar
    this.refresh()
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.code && e.code.startsWith('Digit')) {
        const i = Number(e.code.slice(5)) - 1
        if (i >= 0 && i < this.size) this.select(i)
      }
    })
    window.addEventListener('wheel', (e) => {
      if (e.deltaY === 0) return
      const dir = e.deltaY > 0 ? 1 : -1
      this.select((this.selected + dir + this.size) % this.size)
    }, { passive: true })
  }

  select(index) {
    if (index < 0 || index >= this.size) return
    this.selected = index
    this.refresh()
  }

  selectedStack() {
    return this.inventory.slots[this.selected] || null
  }

  selectedBlockId() {
    const stack = this.selectedStack()
    return stack ? stack.id : null
  }

  consumeOne() {
    const stack = this.selectedStack()
    if (!stack) return
    this.inventory.removeAt(this.selected, 1)
  }

  refresh() {
    for (let i = 0; i < this.size; i++) {
      const entry = this.cells[i]
      const cell = entry.cell
      const iconWrap = entry.iconWrap
      const count = entry.count
      const slot = this.inventory.slots[i]
      if (i === this.selected) cell.classList.add('selected')
      else cell.classList.remove('selected')
      if (slot) {
        const def = getThing(slot.id)
        const iconId = slot.id
        if (entry.currentIconId !== iconId) {
          iconWrap.replaceChildren()
          const icon = getIconCanvas({ id: slot.id, name: def?.name, color: def?.color })
          if (icon) iconWrap.appendChild(icon)
          entry.currentIconId = iconId
        }
        count.textContent = slot.count > 1 ? String(slot.count) : ''
        cell.classList.add('filled')
        cell.style.background = ''
        if (def && Number.isFinite(def.maxDurability) && def.maxDurability > 0) {
          const dur = slot.durability === undefined ? def.maxDurability : slot.durability
          const pct = Math.max(0, Math.min(100, (dur / def.maxDurability) * 100))
          const inner = entry.durability.querySelector('.slot-durability-inner')
          if (pct < 100 && inner) {
            entry.durability.style.display = 'block'
            inner.style.width = pct + '%'
            let color = '#55ff55'
            if (pct < 25) color = '#ff2222'
            else if (pct < 50) color = '#ffaa00'
            inner.style.backgroundColor = color
          } else {
            entry.durability.style.display = 'none'
          }
        } else {
          entry.durability.style.display = 'none'
        }
      } else {
        if (entry.currentIconId !== null) {
          iconWrap.replaceChildren()
          entry.currentIconId = null
        }
        count.textContent = ''
        cell.classList.remove('filled')
        cell.style.background = ''
        entry.durability.style.display = 'none'
      }
    }
  }
}
