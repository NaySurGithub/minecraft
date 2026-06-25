import { getThing } from '../items/itemRegistry.js'

const MAX_HEARTS = 10
const MAX_BUBBLES = 10
const MAX_FOOD = 10
const MAX_ARMOR = 10

export class HealthUI {
  constructor(parent, health, inventory = null) {
    this.health = health
    this.inventory = inventory

    this.armorEl = document.createElement('div')
    this.armorEl.id = 'armor-bar'
    this.armorEls = []
    for (let i = 0; i < MAX_ARMOR; i++) {
      const el = document.createElement('div')
      el.className = 'armor'
      this.armorEl.appendChild(el)
      this.armorEls.push(el)
    }

    this.heartsEl = document.createElement('div')
    this.heartsEl.id = 'hearts'
    this.bubblesEl = document.createElement('div')
    this.bubblesEl.id = 'bubbles'
    this.foodEl = document.createElement('div')
    this.foodEl.id = 'food'

    this.heartEls = []
    for (let i = 0; i < MAX_HEARTS; i++) {
      const el = document.createElement('div')
      el.className = 'heart'
      this.heartsEl.appendChild(el)
      this.heartEls.push(el)
    }

    this.bubbleEls = []
    for (let i = 0; i < MAX_BUBBLES; i++) {
      const el = document.createElement('div')
      el.className = 'bubble'
      this.bubblesEl.appendChild(el)
      this.bubbleEls.push(el)
    }

    this.foodEls = []
    for (let i = 0; i < MAX_FOOD; i++) {
      const el = document.createElement('div')
      el.className = 'food'
      this.foodEl.appendChild(el)
      this.foodEls.push(el)
    }

    parent.appendChild(this.armorEl)
    parent.appendChild(this.heartsEl)
    parent.appendChild(this.foodEl)
    parent.appendChild(this.bubblesEl)

    health.onChange(() => this.refresh())
    if (inventory && typeof inventory.onChange === 'function') inventory.onChange(() => this.updateArmor())
    this.refresh()
    this.updateArmor()
  }

  _armorDefense() {
    const inv = this.inventory
    if (!inv) return 0
    let defense = 0
    for (const slotIdx of [36, 37, 38, 39]) {
      const stack = inv.slots[slotIdx]
      if (!stack || !stack.id) continue
      const thing = getThing(stack.id)
      if (thing && thing.category === 'armor') defense += thing.defense || 0
    }
    return defense
  }

  _armorPiecesEquipped() {
    const inv = this.inventory
    if (!inv) return 0
    let pieces = 0
    for (const slotIdx of [36, 37, 38, 39]) {
      const stack = inv.slots[slotIdx]
      if (!stack || !stack.id) continue
      const thing = getThing(stack.id)
      if (thing && thing.category === 'armor') pieces++
    }
    return pieces
  }

  updateArmor() {
    const h = this.health
    if (!this.inventory || h.invincible || this._armorPiecesEquipped() <= 0) {
      this.armorEl.style.display = 'none'
      return
    }
    this.armorEl.style.display = 'flex'
    const filled = Math.max(0, Math.min(MAX_ARMOR, Math.ceil(this._armorDefense() / 2)))
    for (let i = 0; i < MAX_ARMOR; i++) {
      const el = this.armorEls[i]
      el.classList.remove('full', 'empty')
      el.classList.add(i < filled ? 'full' : 'empty')
    }
  }

  refresh() {
    const h = this.health
    if (h.invincible) {
      this.armorEl.style.display = 'none'
      this.heartsEl.style.display = 'none'
      this.foodEl.style.display = 'none'
      this.bubblesEl.style.display = 'none'
      return
    }
    this.updateArmor()
    this.heartsEl.style.display = 'flex'
    this.foodEl.style.display = 'flex'

    const hp = Math.max(0, h.hp)
    for (let i = 0; i < MAX_HEARTS; i++) {
      const heartValue = hp - i * 2
      const el = this.heartEls[i]
      el.classList.remove('full', 'half', 'empty')
      if (heartValue >= 2) el.classList.add('full')
      else if (heartValue >= 1) el.classList.add('half')
      else el.classList.add('empty')
    }

    const hunger = Math.max(0, h.hunger == null ? 0 : h.hunger)
    for (let i = 0; i < MAX_FOOD; i++) {
      const foodValue = hunger - i * 2
      const el = this.foodEls[i]
      el.classList.remove('full', 'half', 'empty')
      if (foodValue >= 2) el.classList.add('full')
      else if (foodValue >= 1) el.classList.add('half')
      else el.classList.add('empty')
    }

    const showBubbles = h.air < h.maxAir
    this.bubblesEl.style.display = showBubbles ? 'flex' : 'none'
    if (showBubbles) {
      const perBubble = h.maxAir / MAX_BUBBLES
      const filled = Math.ceil(h.air / perBubble)
      for (let i = 0; i < MAX_BUBBLES; i++) {
        const el = this.bubbleEls[i]
        el.classList.remove('full', 'empty')
        el.classList.add(i < filled ? 'full' : 'empty')
      }
    }
    this.updateArmor()
  }
}
