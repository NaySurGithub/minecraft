import { blocks } from '../blocks/registry.js'
import { getThingByName, getThing } from '../items/itemRegistry.js'
import { getFurnaceRecipeByInput } from './furnaceRecipes.js'
import { SlotController } from './slotController.js'
import { paintIconSlot, createHoverInfo } from './inventoryUI.js'

const SMELT_TICK_SECONDS = 8

function isFuel(id) {
  const coal = getThingByName('coal')
  const lava = getThingByName('lava_bucket')
  const bucket = getThingByName('bucket')
  return (coal && coal.id === id) || (lava && lava.id === id) || (bucket && bucket.id === id)
}

export class FurnaceUI {
  constructor(app, inventory) {
    this.app = app
    this.inventory = inventory
    this.open = false
    this.slotController = new SlotController(app)
    this.input = null
    this.fuel = null
    this.output = null
    this.progress = 0
    this.burn = 0
    this.cells = {}
    this.onClose = null
    this._build()
    this.inventory.onChange(() => this.refresh())
  }

  _build() {
    const overlay = document.createElement('div')
    overlay.id = 'furnaceoverlay'
    overlay.style.display = 'none'

    const panel = document.createElement('div')
    panel.className = 'mc-inventory mc-furnace-panel'

    const title = document.createElement('div')
    title.className = 'mc-table-title'
    title.textContent = 'Furnace'

    this.hoverInfo = createHoverInfo(panel)

    const row = document.createElement('div')
    row.className = 'mc-furnace-row'

    const input = document.createElement('div')
    input.className = 'mc-slot'
    const fuel = document.createElement('div')
    fuel.className = 'mc-slot'
    const arrow = document.createElement('div')
    arrow.className = 'mc-furnace-arrow'
    const output = document.createElement('div')
    output.className = 'mc-slot mc-furnace-output'

    row.appendChild(input)
    row.appendChild(fuel)
    row.appendChild(arrow)
    row.appendChild(output)

    this.cells.input = input
    this.cells.fuel = fuel
    this.cells.output = output

    this.slotController.attachSlot(input, this._accessor('input'))
    this.slotController.attachSlot(fuel, this._accessor('fuel'))
    this.slotController.attachSlot(output, this._accessor('output'))

    this.hoverInfo.attach(input, () => this.input)
    this.hoverInfo.attach(fuel, () => this.fuel)
    this.hoverInfo.attach(output, () => this.output)

    const invGrid = document.createElement('div')
    invGrid.className = 'mc-inv-grid'
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
    panel.appendChild(row)
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

  _accessor(kind) {
    return {
      get: () => this[kind],
      set: (slot) => { this[kind] = slot },
      stackSize: (id) => this.inventory.stackSizeOf(id),
      onChange: () => this.refresh(),
      inventoryName: 'furnace'
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

  show() {
    this.open = true
    this.overlay.style.display = 'flex'
    if (document.pointerLockElement) document.exitPointerLock()
  }

  close() {
    this.open = false
    this.overlay.style.display = 'none'
    const leftovers = this.slotController.returnHeldToInventory(this.inventory)
    if (this.onClose) this.onClose(leftovers)
  }

  toggle() {
    if (this.open) this.close()
    else this.show()
  }

  update(dt) {
    if (!this.input || !this.fuel) return
    const inSlot = this.input
    const fuelSlot = this.fuel
    const outSlot = this.output
    const inputThing = inSlot ? blocks[inSlot.id] : null
    const recipe = inputThing ? getFurnaceRecipeByInput(inputThing.name) : null
    if (!recipe) {
      this.progress = 0
      this.burn = Math.max(0, this.burn - dt * 0.5)
      return
    }
    const outThing = getThingByName(recipe.output)
    if (!outThing) return
    const fits = !outSlot || outSlot.id === outThing.id
    if (!fits) return
    if (this.burn <= 0) {
      if (!fuelSlot) return
      if (!isFuel(fuelSlot.id)) return
      const lavaBucket = getThingByName('lava_bucket')
      const bucket = getThingByName('bucket')
      const emptyBucket = bucket
      if (lavaBucket && fuelSlot.id === lavaBucket.id) {
        fuelSlot.id = emptyBucket.id
      } else if (bucket && fuelSlot.id === bucket.id && inputThing.name === 'wet_sponge') {
        fuelSlot.id = getThingByName('water_bucket').id
      } else {
        fuelSlot.count -= 1
        if (fuelSlot.count <= 0) this.fuel = null
      }
      this.burn = SMELT_TICK_SECONDS
    }
    this.progress += dt
    this.burn = Math.max(0, this.burn - dt)
    if (this.progress >= SMELT_TICK_SECONDS) {
      this.progress = 0
      if (inSlot) {
        inSlot.count -= 1
        if (inSlot.count <= 0) this.input = null
      }
      if (!outSlot) this.output = { id: outThing.id, count: recipe.count }
      else outSlot.count += recipe.count
    }
    this.refresh()
  }

  refresh() {
    paintIconSlot(this.cells.input, this.input)
    paintIconSlot(this.cells.fuel, this.fuel)
    paintIconSlot(this.cells.output, this.output)
    for (let i = 0; i < this.invCells.length; i++) {
      const cell = this.invCells[i]
      if (!cell) continue
      paintIconSlot(cell, this.inventory.slots[i])
    }
  }
}
