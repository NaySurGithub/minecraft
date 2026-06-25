import { getThing } from '../items/itemRegistry.js'
import { getIconCanvas } from './itemIcons.js'
import { emitModEvent } from '../mods/eventBus.js'
import { InventoryTransactionPacket } from '../packets/InventoryTransactionPacket.js'

// Slot accessors decouple the controller from where the slot data actually
// lives: an inventory storage slot, a craft-grid slot, anything. Each accessor:
//   get()          -> current { id, count } | null
//   set(slot)      -> replace the slot's contents (null clears it)
//   stackSize(id)  -> max stack size for that item
//   onChange()     -> notify the host UI to repaint and recompute (optional)
//
// Interaction model:
//   Left click  on empty slot, holding stack -> drop whole held stack
//   Left click  on slot with same item       -> merge held into slot up to stack size
//   Left click  on slot with diff item       -> swap held <-> slot
//   Left click  on slot, not holding         -> pick up entire stack
//   Right click on empty slot, holding stack -> drop ONE item from held
//   Right click on slot with same item       -> drop ONE if room
//   Right click on slot, not holding         -> pick up HALF (rounded up)
//   Left drag across multiple slots holding  -> distribute evenly (32 -> 16/16)
//   Right drag across multiple slots holding -> drop ONE per slot
//
// Distribute timing detail: left-click on a single slot then release = treated
// as a regular click (drop whole stack). The even-split only kicks in once the
// cursor moves into a SECOND slot while the button is held — that's when we
// know it's a drag-distribute, not a click.
export class SlotController {
  constructor(app) {
    this.app = app
    this.held = null               // { id, count } | null
    this.slots = []                // [{ el, accessor }]
    this.dragMode = null           // 'left' | 'right' | null
    this.dragVisited = new Set()   // slot indices touched this drag
    this.dragStartHeldCount = 0    // for even distribution
    this.dragBaselines = new Map() // index -> pre-drag count of same-id items
    this.dragStartIndex = -1       // first slot pressed; used for click vs drag
    this.touchActive = false
    this.touchStartIndex = -1
    this.touchCurrentIndex = -1
    this.touchMoved = false
    this.touchSplitMode = false
    this.touchHoldTimer = null
    this._buildCursor()
    this._bindGlobals()
  }

  _buildCursor() {
    const el = document.createElement('div')
    el.className = 'mc-cursor-stack'
    el.style.display = 'none'
    el.style.position = 'fixed'
    el.style.pointerEvents = 'none'
    el.style.zIndex = '10000'
    el.style.display = 'none'
    el.style.padding = '4px 6px'
    el.style.minWidth = '56px'
    el.style.minHeight = '56px'
    el.style.alignItems = 'center'
    el.style.justifyContent = 'center'
    this.app.appendChild(el)
    this.cursorEl = el
  }

  _bindGlobals() {
    document.addEventListener('mousemove', (e) => {
      if (!this.held) return
      this._moveCursor(e.clientX, e.clientY)
    })
    document.addEventListener('mouseup', (e) => {
      // If left-drag ended with only the starting slot visited, treat it as a
      // normal click: drop the whole held stack into that slot (merge/swap).
      if (e.button === 0 && this.dragMode === 'left' && this.dragVisited.size <= 1) {
        this._leftClickDrop(this.dragStartIndex)
      }
      this._finishDrag()
    })
    document.addEventListener('contextmenu', (e) => {
      if (this.held || this._isOverManagedSlot(e.target)) e.preventDefault()
    })
  }

  _moveCursor(x, y) {
    this.cursorEl.style.left = (x + 8) + 'px'
    this.cursorEl.style.top = (y + 8) + 'px'
  }

  _finishDrag() {
    this.dragMode = null
    this.dragVisited.clear()
    this.dragBaselines.clear()
    this.dragStartHeldCount = 0
    this.dragStartIndex = -1
    this._stopHoldRepeat()
    this._refreshCursor()
  }

  _emitTransaction(detail) {
    const ev = emitModEvent(new InventoryTransactionPacket(detail), this.app?.__modContext || globalThis.__modContext || {})
    return !ev.cancelled
  }

  _slotData(slot) {
    return slot ? { id: slot.id, count: slot.count, durability: slot.durability } : null
  }

  _snapshotSlots(indices) {
    const out = new Map()
    for (const i of indices || []) {
      const slot = this.slots[i]?.accessor?.get?.()
      out.set(i, slot ? { ...slot } : null)
    }
    return out
  }

  _restoreSlots(snapshot) {
    if (!snapshot) return
    for (const [i, slot] of snapshot.entries()) {
      const acc = this.slots[i]?.accessor
      if (!acc) continue
      acc.set(slot ? { ...slot } : null)
      acc.onChange && acc.onChange()
    }
  }

  _tx(detail) {
    return {
      action: detail.action || detail.phase || 'transaction',
      phase: detail.phase || 'transaction',
      slotNumber1: detail.slotNumber1 ?? detail.slotIndex ?? -1,
      slotNumber2: detail.slotNumber2 ?? -1,
      item1: detail.item1 || null,
      item2: detail.item2 || null,
      heldItem: detail.heldItem || null,
      inventoryName: detail.inventoryName || 'inventory',
      fromSlot: detail.fromSlot ?? detail.slot1 ?? detail.slotNumber1 ?? detail.slotIndex ?? -1,
      toSlot: detail.toSlot ?? detail.slot2 ?? detail.slotNumber2 ?? -1,
      fromItem: detail.fromItem || detail.item1 || null,
      toItem: detail.toItem || detail.item2 || null,
      slot1: detail.slot1 ?? detail.slotNumber1 ?? detail.slotIndex ?? -1,
      slot2: detail.slot2 ?? detail.slotNumber2 ?? -1,
      ...detail
    }
  }

  _isOverManagedSlot(target) {
    for (const s of this.slots) {
      if (s.el === target || s.el.contains(target)) return true
    }
    return false
  }

  attachSlot(el, accessor) {
    const index = this.slots.length
    this.slots.push({ el, accessor })

    el.addEventListener('mousedown', (e) => {
      e.preventDefault()
      if (e.button === 0) this._onLeftMouseDown(index)
      else if (e.button === 2) this._onRightMouseDown(index)
    })
    el.addEventListener('mouseenter', () => {
      if (this.dragMode === 'left') this._dragLeftVisit(index)
      else if (this.dragMode === 'right') {
        this._dragRightVisit(index)
        this._holdRepeatIndex = index
      }
    })
    el.addEventListener('contextmenu', (e) => e.preventDefault())
    el.addEventListener('touchstart', (e) => {
      e.preventDefault()
      this._onTouchStart(index, e)
    }, { passive: false })
    el.addEventListener('touchmove', (e) => {
      e.preventDefault()
      this._onTouchMove(e)
    }, { passive: false })
    el.addEventListener('touchend', (e) => {
      e.preventDefault()
      this._onTouchEnd(e)
    }, { passive: false })
    el.addEventListener('touchcancel', (e) => {
      e.preventDefault()
      this._onTouchEnd(e)
    }, { passive: false })

    return index
  }

  _slotIndexFromPoint(x, y) {
    const node = document.elementFromPoint(x, y)
    if (!node) return -1
    for (let i = 0; i < this.slots.length; i++) {
      const el = this.slots[i].el
      if (el === node || el.contains(node)) return i
    }
    return -1
  }

  _onTouchStart(index, e) {
    const t = e.changedTouches[0]
    if (!t) return
    this.touchActive = true
    this.touchStartIndex = index
    this.touchCurrentIndex = index
    this.touchMoved = false
    this.touchSplitMode = false
    this._moveCursor(t.clientX, t.clientY)

    this.touchHoldTimer = setTimeout(() => {
      if (!this.touchActive || this.touchStartIndex !== index) return
      this.touchSplitMode = true
      this._onRightMouseDown(index)
      this._moveCursor(t.clientX, t.clientY)
    }, 320)
  }

  _onTouchMove(e) {
    if (!this.touchActive) return
    const t = e.changedTouches[0]
    if (!t) return
    this.touchMoved = true
    this._moveCursor(t.clientX, t.clientY)
    const index = this._slotIndexFromPoint(t.clientX, t.clientY)
    if (index < 0 || index === this.touchCurrentIndex) return
    this.touchCurrentIndex = index

    if (this.touchSplitMode) {
      if (this.dragMode === 'right') {
        this._dragRightVisit(index)
        this._holdRepeatIndex = index
      }
      return
    }

    if (this.touchHoldTimer) {
      clearTimeout(this.touchHoldTimer)
      this.touchHoldTimer = null
    }
    if (!this.dragMode) this._onLeftMouseDown(this.touchStartIndex)
    if (this.dragMode === 'left') this._dragLeftVisit(index)
  }

  _onTouchEnd(e) {
    if (!this.touchActive) return
    if (this.touchHoldTimer) {
      clearTimeout(this.touchHoldTimer)
      this.touchHoldTimer = null
    }
    const t = e.changedTouches[0]
    if (t) this._moveCursor(t.clientX, t.clientY)

    if (!this.touchSplitMode && !this.touchMoved) {
      this._onLeftMouseDown(this.touchStartIndex)
    }
    if (!this.touchSplitMode && this.touchMoved && !this.dragMode && this.held && this.touchCurrentIndex >= 0) {
      this._leftClickDrop(this.touchCurrentIndex)
    }
    if (this.dragMode === 'left' && this.dragVisited.size <= 1) {
      this._leftClickDrop(this.dragStartIndex)
    }
    this._finishDrag()

    this.touchActive = false
    this.touchStartIndex = -1
    this.touchCurrentIndex = -1
    this.touchMoved = false
    this.touchSplitMode = false
  }

  _startHoldRepeat(index) {
    this._stopHoldRepeat()
    this._holdRepeatIndex = index
    this._holdRepeatTimer = setInterval(() => {
      if (!this.held || this.dragMode !== 'right') {
        this._stopHoldRepeat()
        return
      }
      const i = this._holdRepeatIndex
      this.dragVisited.delete(i)
      this._dragRightVisit(i)
    }, 120)
  }

  _stopHoldRepeat() {
    if (this._holdRepeatTimer) {
      clearInterval(this._holdRepeatTimer)
      this._holdRepeatTimer = null
    }
    this._holdRepeatIndex = null
  }

  _onLeftMouseDown(index) {
    const slot = this.slots[index]
    const current = slot.accessor.get()
    const baseDetail = this._tx({
      slotIndex: index,
      slotNumber1: index,
      inventoryName: slot.accessor.inventoryName || slot.accessor.name || 'inventory',
      current: this._slotData(current),
      item1: this._slotData(current),
      held: this._slotData(this.held),
      heldItem: this._slotData(this.held),
      phase: 'pickup'
    })
    if (this.held) {
      // Arm a left-drag but DO NOT place anything yet. If the user releases
      // without entering another slot, mouseup will treat it as a click and
      // drop the whole stack via _leftClickDrop. If they enter a 2nd slot,
      // _dragLeftVisit kicks in and distributes evenly.
      this.dragMode = 'left'
      this.dragVisited.clear()
      this.dragBaselines.clear()
      this.dragStartHeldCount = this.held.count
      this.dragStartIndex = index
      this.dragVisited.add(index)
      // Snapshot baseline for the starting slot.
      const base = current && current.id === this.held.id ? current.count : 0
      this.dragBaselines.set(index, base)
    } else if (current) {
      if (!this._emitTransaction(this._tx({ ...baseDetail, phase: 'take', action: 'take' }))) return
      // Pick up the entire stack.
      this.held = { id: current.id, count: current.count }
      slot.accessor.set(null)
      slot.accessor.onChange && slot.accessor.onChange()
      this._refreshCursor()
    }
  }

  // Regular left-click placement: drop whole stack, merge into same-id, or
  // swap with a different-id stack.
  _leftClickDrop(index) {
    if (index < 0 || !this.held) return
    const slot = this.slots[index]
    const current = slot.accessor.get()
    const id = this.held.id
    const max = slot.accessor.stackSize(id)
    if (slot.accessor.accepts && !slot.accessor.accepts(this.held)) return
    const snapshot = this._snapshotSlots([index])
    const heldSnapshot = this.held ? { ...this.held } : null
    const ev = emitModEvent(new InventoryTransactionPacket(this._tx({
      slotIndex: index,
      slotNumber1: index,
      slotNumber2: index,
      slot1: index,
      slot2: index,
      inventoryName: slot.accessor.inventoryName || slot.accessor.name || 'inventory',
      phase: 'leftClick',
      current: this._slotData(current),
      item1: this._slotData(current),
      item2: this._slotData(this.held),
      fromSlot: index,
      toSlot: index,
      fromItem: this._slotData(current),
      toItem: this._slotData(this.held),
      held: this._slotData(this.held),
      heldItem: this._slotData(this.held)
    })), this.app?.__modContext || globalThis.__modContext || {})
    if (ev.cancelled) {
      this._restoreSlots(snapshot)
      this.held = heldSnapshot
      this._refreshCursor()
      return
    }
    if (!current) {
      slot.accessor.set({ id, count: this.held.count })
      this.held = null
    } else if (current.id === id) {
      const room = max - current.count
      const move = Math.min(room, this.held.count)
      if (move > 0) {
        slot.accessor.set({ id, count: current.count + move })
        this.held.count -= move
        if (this.held.count <= 0) this.held = null
      }
    } else {
      // Swap.
      const swapped = { id: current.id, count: current.count }
      slot.accessor.set({ id: this.held.id, count: this.held.count })
      this.held = swapped
    }
    slot.accessor.onChange && slot.accessor.onChange()
    this._refreshCursor()
  }

  _onRightMouseDown(index) {
    const slot = this.slots[index]
    const current = slot.accessor.get()
    if (this.held) {
      const snapshot = this._snapshotSlots([index])
      const heldSnapshot = this.held ? { ...this.held } : null
      const ev = emitModEvent(new InventoryTransactionPacket(this._tx({
        slotIndex: index,
        slotNumber1: index,
        slotNumber2: index,
        slot1: index,
        slot2: index,
        inventoryName: slot.accessor.inventoryName || slot.accessor.name || 'inventory',
        phase: 'rightClick',
        current: this._slotData(current),
        item1: this._slotData(current),
        item2: this._slotData(this.held),
        fromSlot: index,
        toSlot: index,
        fromItem: this._slotData(current),
        toItem: this._slotData(this.held),
        held: this._slotData(this.held),
        heldItem: this._slotData(this.held)
      })), this.app?.__modContext || globalThis.__modContext || {})
      if (ev.cancelled) {
        this._restoreSlots(snapshot)
        this.held = heldSnapshot
        this._refreshCursor()
        return
      }
      this.dragMode = 'right'
      this.dragVisited.clear()
      this._dragRightVisit(index)
      this._startHoldRepeat(index)
    } else if (current) {
      const take = Math.ceil(current.count / 2)
      this.held = { id: current.id, count: take }
      const remain = current.count - take
      if (remain > 0) slot.accessor.set({ id: current.id, count: remain })
      else slot.accessor.set(null)
      slot.accessor.onChange && slot.accessor.onChange()
      this._refreshCursor()
    }
  }

  // Left-drag distribute: only runs once the cursor enters a slot beyond the
  // starting one. Recomputes the even split across all visited slots each time
  // a new slot is added, using per-slot baselines captured on first visit.
  _dragLeftVisit(index) {
    if (!this.held && this.dragStartHeldCount === 0) return
    if (this.dragVisited.has(index)) return
    const slot = this.slots[index]
    const current = slot.accessor.get()
    const id = this.dragStartHeldCount > 0
      ? (this.held ? this.held.id : this.slots[this.dragStartIndex].accessor.get()?.id)
      : this.held.id
    if (!id) return
    if (current && current.id !== id) return
    const snapshot = this._snapshotSlots([index])
    const heldSnapshot = this.held ? { ...this.held } : null
    const ev = emitModEvent(new InventoryTransactionPacket(this._tx({
      slotIndex: index,
      slotNumber1: index,
      slotNumber2: index,
      slot1: index,
      slot2: index,
      inventoryName: slot.accessor.inventoryName || slot.accessor.name || 'inventory',
      phase: 'dragLeft',
      current: this._slotData(current),
      item1: this._slotData(current),
      item2: this._slotData(this.held),
      fromSlot: this.dragStartIndex,
      toSlot: index,
      fromItem: this._slotData(this.slots[this.dragStartIndex]?.accessor?.get?.()),
      toItem: this._slotData(current),
      held: this._slotData(this.held),
      heldItem: this._slotData(this.held)
    })), this.app?.__modContext || globalThis.__modContext || {})
    if (ev.cancelled) {
      this._restoreSlots(snapshot)
      this.held = heldSnapshot
      this._refreshCursor()
      return
    }

    // Capture baseline for this newly-visited slot before we write anything.
    const base = current && current.id === id ? current.count : 0
    this.dragBaselines.set(index, base)
    this.dragVisited.add(index)

    const visited = Array.from(this.dragVisited)
    const share = Math.floor(this.dragStartHeldCount / visited.length)
    if (share === 0) {
      // Not enough to spread one each — roll back this visit.
      this.dragVisited.delete(index)
      this.dragBaselines.delete(index)
      return
    }

    let totalPlaced = 0
    for (const vi of visited) {
      const vs = this.slots[vi]
      const baseline = this.dragBaselines.get(vi) ?? 0
      const max = vs.accessor.stackSize(id)
      const newCount = Math.min(max, baseline + share)
      const placed = newCount - baseline
      if (newCount > 0) vs.accessor.set({ id, count: newCount })
      else vs.accessor.set(null)
      totalPlaced += placed
      vs.accessor.onChange && vs.accessor.onChange()
    }

    const remaining = this.dragStartHeldCount - totalPlaced
    if (remaining > 0) this.held = { id, count: remaining }
    else this.held = null
    this._refreshCursor()
  }

  _dragRightVisit(index) {
    if (!this.held) return
    if (this.dragVisited.has(index)) return
    const slot = this.slots[index]
    const current = slot.accessor.get()
    const id = this.held.id
    if (slot.accessor.accepts && !slot.accessor.accepts(this.held)) return
    const max = slot.accessor.stackSize(id)
    if (current && current.id !== id) return
    if (current && current.count >= max) return
    const snapshot = this._snapshotSlots([index])
    const heldSnapshot = this.held ? { ...this.held } : null
    const ev = emitModEvent(new InventoryTransactionPacket(this._tx({
      slotIndex: index,
      slotNumber1: index,
      slotNumber2: index,
      slot1: index,
      slot2: index,
      inventoryName: slot.accessor.inventoryName || slot.accessor.name || 'inventory',
      phase: 'dragRight',
      current: this._slotData(current),
      item1: this._slotData(current),
      item2: this._slotData(this.held),
      fromSlot: this.dragStartIndex,
      toSlot: index,
      fromItem: this._slotData(this.slots[this.dragStartIndex]?.accessor?.get?.()),
      toItem: this._slotData(current),
      held: this._slotData(this.held),
      heldItem: this._slotData(this.held)
    })), this.app?.__modContext || globalThis.__modContext || {})
    if (ev.cancelled) {
      this._restoreSlots(snapshot)
      this.held = heldSnapshot
      this._refreshCursor()
      return
    }
    this.dragVisited.add(index)
    const newCount = (current ? current.count : 0) + 1
    slot.accessor.set({ id, count: newCount })
    this.held.count -= 1
    if (this.held.count <= 0) this.held = null
    slot.accessor.onChange && slot.accessor.onChange()
    this._refreshCursor()
  }

  _refreshCursor() {
    if (!this.held) {
      this.cursorEl.style.display = 'none'
      this.cursorEl.replaceChildren()
      return
    }
    const thing = getThing(this.held.id)
    const canvas = getIconCanvas({ id: this.held.id })
    this.cursorEl.replaceChildren()
    if (canvas) {
      const iconWrap = document.createElement('span')
      iconWrap.className = 'mc-cursor-icon'
      iconWrap.appendChild(canvas)
      this.cursorEl.appendChild(iconWrap)
    }
    const count = document.createElement('span')
    count.className = 'mc-cursor-count'
    count.textContent = this.held.count > 1 ? String(this.held.count) : ''
    this.cursorEl.appendChild(count)
    this.cursorEl.title = thing?.label || '?'
    this.cursorEl.style.display = 'flex'
  }

  returnHeldToInventory(inventory) {
    if (!this.held) return []
    const leftover = inventory.addItem(this.held.id, this.held.count)
    const out = leftover > 0 ? [{ id: this.held.id, count: leftover }] : []
    this.held = null
    this._refreshCursor()
    return out
  }
}
