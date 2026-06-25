const ACHIEVEMENTS = {
  firstWood: {
    title: 'Getting Wood',
    desc: 'Collected your first wood block.',
    icon: 'W'
  },
  firstCraftingTable: {
    title: 'Benchmarking',
    desc: 'Placed or used a crafting table.',
    icon: 'C'
  },
  firstDiamond: {
    title: 'Diamonds!',
    desc: 'Found your first diamond.',
    icon: 'D'
  },
  firstNetherPortal: {
    title: 'Into the Nether',
    desc: 'Created or entered a Nether portal.',
    icon: 'N'
  },
  firstMobKill: {
    title: 'Monster Hunter',
    desc: 'Killed your first mob.',
    icon: 'M'
  }
}

function defaultStats() {
  return {
    blocksBroken: 0,
    blocksPlaced: 0,
    itemsPickedUp: 0,
    mobsKilled: 0,
    portalsCreated: 0,
    dimensionTravels: 0,
    achievementsUnlocked: 0
  }
}

export class AchievementManager {
  constructor(app) {
    this.app = app || document.body
    this.stats = defaultStats()
    this.unlocked = new Set()
    this.queue = []
    this.active = false
    this.root = document.createElement('div')
    this.root.id = 'achievement-popups'
    this.root.className = 'achievement-popups'
    this.app.appendChild(this.root)
  }

  load(data = {}) {
    this.stats = { ...defaultStats(), ...(data.stats || {}) }
    this.unlocked = new Set(Array.isArray(data.unlocked) ? data.unlocked : [])
    this.stats.achievementsUnlocked = this.unlocked.size
  }

  serialize() {
    return {
      stats: { ...this.stats, achievementsUnlocked: this.unlocked.size },
      unlocked: [...this.unlocked]
    }
  }

  dispose() {
    if (this.root?.parentNode) this.root.parentNode.removeChild(this.root)
    this.queue.length = 0
    this.active = false
  }

  unlock(id) {
    const def = ACHIEVEMENTS[id]
    if (!def || this.unlocked.has(id)) return false
    this.unlocked.add(id)
    this.stats.achievementsUnlocked = this.unlocked.size
    this.queue.push(def)
    this._pump()
    return true
  }

  recordBlockBreak(blockName) {
    this.stats.blocksBroken++
    if (blockName === 'oak_log' || blockName === 'oak_planks') this.unlock('firstWood')
    if (blockName === 'diamond_ore' || blockName === 'diamond_block') this.unlock('firstDiamond')
  }

  recordBlockPlace(blockName) {
    this.stats.blocksPlaced++
    if (blockName === 'crafting_table') this.unlock('firstCraftingTable')
  }

  recordItemPickup(itemName, count = 1) {
    this.stats.itemsPickedUp += Math.max(1, count | 0)
    if (itemName === 'oak_log' || itemName === 'oak_planks') this.unlock('firstWood')
    if (itemName === 'diamond') this.unlock('firstDiamond')
  }

  recordCraftingTableUse() {
    this.unlock('firstCraftingTable')
  }

  recordPortalCreated() {
    this.stats.portalsCreated++
    this.unlock('firstNetherPortal')
  }

  recordDimensionTravel() {
    this.stats.dimensionTravels++
    this.unlock('firstNetherPortal')
  }

  recordMobKill() {
    this.stats.mobsKilled++
    this.unlock('firstMobKill')
  }

  _pump() {
    if (this.active || !this.queue.length) return
    this.active = true
    const def = this.queue.shift()
    const node = document.createElement('div')
    node.className = 'achievement-popup'
    node.innerHTML = `
      <div class="achievement-popup__icon">${def.icon}</div>
      <div class="achievement-popup__text">
        <div class="achievement-popup__eyebrow">Achievement Get!</div>
        <div class="achievement-popup__title"></div>
        <div class="achievement-popup__desc"></div>
      </div>
    `
    node.querySelector('.achievement-popup__title').textContent = def.title
    node.querySelector('.achievement-popup__desc').textContent = def.desc
    this.root.appendChild(node)
    requestAnimationFrame(() => node.classList.add('show'))
    setTimeout(() => {
      node.classList.remove('show')
      setTimeout(() => {
        if (node.parentNode) node.parentNode.removeChild(node)
        this.active = false
        this._pump()
      }, 350)
    }, 3600)
  }
}
