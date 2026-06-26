import { getThing } from '../items/itemRegistry.js'

// --- Tamper hardening -------------------------------------------------
// Lock every gameplay method onto the prototype as non-writable and
// non-configurable. This stops the classic DevTools monkey-patch attack:
//   inventory.addItem = () => {}            -> silently ignored / throws
//   Inventory.prototype.addItem = () => {}  -> throws (can't redefine)
// We do this once, right after the class body, instead of scattering
// Object.freeze calls through the methods themselves.
function lockMethods(Klass, names) {
  for (const name of names) {
    const fn = Klass.prototype[name]
    if (typeof fn !== 'function') continue
    Object.defineProperty(Klass.prototype, name, {
      value: fn,
      writable: false,
      configurable: false,
      enumerable: false
    })
  }
  Object.freeze(Klass.prototype)
}

const GUARDED_METHODS = [
  'onChange', 'emit', 'stackSizeOf', 'addItem', 'removeAt', 'countOf',
  'consume', 'swap', 'merge', 'clear', 'serialize', 'load'
]

export class Inventory {
  constructor(size) {
    this.size = size || 36
    this.slots = new Array(this.size).fill(null)
    this.listeners = []
  }

  onChange(fn) {
    this.listeners.push(fn)
  }

  emit() {
    for (const fn of this.listeners) fn()
  }

  stackSizeOf(id) {
    const b = getThing(id)
    return b ? b.stackSize : 64
  }

  // NOTE: addItem/removeAt/consume/swap/merge/clear/load are the
  // *local* (trusted-context) mutation API. In multiplayer client mode
  // these must not be called directly off the back of player input —
  // see net/inventoryIntent.js, which routes pickups/crafting through
  // the host for validation instead of mutating this object directly.
  addItem(id, count) {
    let remaining = count
    const max = this.stackSizeOf(id)
    for (let i = 0; i < this.size && remaining > 0; i++) {
      const slot = this.slots[i]
      if (slot && slot.id === id && slot.count < max) {
        const space = max - slot.count
        const add = Math.min(space, remaining)
        slot.count += add
        remaining -= add
      }
    }
    for (let i = 0; i < this.size && remaining > 0; i++) {
      if (!this.slots[i]) {
        const add = Math.min(max, remaining)
        this.slots[i] = { id, count: add }
        remaining -= add
      }
    }
    if (remaining !== count) this.emit()
    return remaining
  }

  removeAt(index, count) {
    const slot = this.slots[index]
    if (!slot) return 0
    const take = Math.min(count == null ? slot.count : count, slot.count)
    slot.count -= take
    if (slot.count <= 0) this.slots[index] = null
    this.emit()
    return take
  }

  countOf(id) {
    let total = 0
    for (const slot of this.slots) {
      if (slot && slot.id === id) total += slot.count
    }
    return total
  }

  consume(id, count) {
    if (this.countOf(id) < count) return false
    let remaining = count
    for (let i = 0; i < this.size && remaining > 0; i++) {
      const slot = this.slots[i]
      if (slot && slot.id === id) {
        const take = Math.min(slot.count, remaining)
        slot.count -= take
        remaining -= take
        if (slot.count <= 0) this.slots[i] = null
      }
    }
    this.emit()
    return true
  }

  swap(a, b) {
    const tmp = this.slots[a]
    this.slots[a] = this.slots[b]
    this.slots[b] = tmp
    this.emit()
  }

  merge(from, to) {
    const src = this.slots[from]
    const dst = this.slots[to]
    if (!src) return
    if (!dst) {
      this.slots[to] = src
      this.slots[from] = null
      this.emit()
      return
    }
    if (dst.id === src.id) {
      const max = this.stackSizeOf(src.id)
      const space = max - dst.count
      const move = Math.min(space, src.count)
      dst.count += move
      src.count -= move
      if (src.count <= 0) this.slots[from] = null
      this.emit()
    } else {
      this.swap(from, to)
    }
  }

  clear() {
    for (let i = 0; i < this.slots.length; i++) this.slots[i] = null
    this.emit()
  }

  serialize() {
    return this.slots.map((s) => s ? { id: s.id, count: s.count } : null)
  }

  load(data) {
    if (!data) return
    this.slots = data.map((s) => s ? { id: s.id, count: s.count } : null)
    while (this.slots.length < this.size) this.slots.push(null)
    this.emit()
  }
}

lockMethods(Inventory, GUARDED_METHODS)

export class DoubleChestInventory extends Inventory {
  constructor(left, right) {
    super(54)
    this.left = left
    this.right = right

    this.slots = new Proxy([], {
      get: (target, prop) => {
        const index = Number(prop)
        if (!isNaN(index) && index >= 0 && index < 54) {
          if (index < 27) {
            return this.left.slots[index]
          } else {
            return this.right.slots[index - 27]
          }
        }
        if (prop === 'length') return 54
        return target[prop]
      },
      set: (target, prop, value) => {
        const index = Number(prop)
        if (!isNaN(index) && index >= 0 && index < 54) {
          if (index < 27) {
            this.left.slots[index] = value
            this.left.emit()
          } else {
            this.right.slots[index - 27] = value
            this.right.emit()
          }
          this.emit()
          return true
        }
        target[prop] = value
        return true
      }
    })

    this._listenerLeft = () => this.emit()
    this._listenerRight = () => this.emit()
    this.left.onChange(this._listenerLeft)
    this.right.onChange(this._listenerRight)
  }

  destroy() {
    const idxL = this.left.listeners.indexOf(this._listenerLeft)
    if (idxL >= 0) this.left.listeners.splice(idxL, 1)
    const idxR = this.right.listeners.indexOf(this._listenerRight)
    if (idxR >= 0) this.right.listeners.splice(idxR, 1)
  }
}

lockMethods(DoubleChestInventory, ['destroy'])
