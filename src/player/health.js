import { sounds } from '../sounds/soundManager.js'
import { getThing } from '../items/itemRegistry.js'

const MAX_HP = 20
const MAX_AIR = 300
const MAX_HUNGER = 20
const REGEN_INTERVAL = 0.5
const REGEN_DELAY = 4
const AIR_DRAIN_RATE = MAX_AIR / 15
const AIR_REFILL_RATE = MAX_AIR / 1.5
const DROWN_INTERVAL = 1
const DROWN_DAMAGE = 2
const SUFFOCATION_INTERVAL = 0.5
const SUFFOCATION_DAMAGE = 1

export class Health {
  constructor() {
    this.hp = MAX_HP
    this.maxHp = MAX_HP
    this.air = MAX_AIR
    this.maxAir = MAX_AIR
    this.hunger = MAX_HUNGER
    this.maxHunger = MAX_HUNGER
    this.dead = false
    this.invincible = false
    this._regenTimer = 0
    this._regenDelay = 0
    this._drownTimer = 0
    this._suffocationTimer = 0
    this._listeners = []
    this.inventory = null // Injected from main.js
    this.spawnProtection = 0
  }

  onChange(fn) {
    this._listeners.push(fn)
    fn(this)
  }

  _emit() {
    for (const fn of this._listeners) fn(this)
  }

  damage(amount) {
    if (this.invincible || this.spawnProtection > 0) return
    if (this.dead || amount <= 0) return

    let defense = 0
    const inv = this.inventory
    if (inv) {
      const armorSlots = [36, 37, 38, 39]
      const armorItems = []
      for (const slotIdx of armorSlots) {
        const stack = inv.slots[slotIdx]
        if (stack && stack.id) {
          const thing = getThing(stack.id)
          if (thing && thing.category === 'armor') {
            defense += thing.defense || 0
            armorItems.push({ stack, thing, slotIdx })
          }
        }
      }

      const reduction = Math.min(0.80, defense * 0.04)
      amount = Math.max(1, Math.round(amount * (1 - reduction)))

      for (const { stack, thing, slotIdx } of armorItems) {
        if (thing.maxDurability) {
          if (stack.durability === undefined) {
            stack.durability = thing.maxDurability
          }
          stack.durability--
          if (stack.durability <= 0) {
            inv.slots[slotIdx] = null
          }
        }
      }
      if (armorItems.length > 0) {
        inv.emit()
      }
    }

    sounds.playHurt()
    this.hp = Math.max(0, this.hp - amount)
    this._regenDelay = REGEN_DELAY
    this._regenTimer = 0
    if (this.hp <= 0) this.dead = true
    this._emit()
  }

  heal(amount) {
    if (this.dead || amount <= 0) return
    this.hp = Math.min(this.maxHp, this.hp + amount)
    this._emit()
  }

  reset() {
    this.hp = this.maxHp
    this.air = this.maxAir
    this.hunger = this.maxHunger
    this.dead = false
    this._regenTimer = 0
    this._regenDelay = 0
    this._drownTimer = 0
    this._suffocationTimer = 0
    this._emit()
  }

  setSpawnProtection(seconds) {
    this.spawnProtection = Math.max(this.spawnProtection, Number(seconds) || 0)
  }

  serialize() {
    return {
      hp: this.hp,
      air: this.air,
      hunger: this.hunger,
      dead: this.dead,
      maxHp: this.maxHp,
      maxAir: this.maxAir,
      maxHunger: this.maxHunger
    }
  }

  load(data) {
    if (!data) return
    this.hp = data.hp == null ? this.maxHp : data.hp
    this.air = data.air == null ? this.maxAir : data.air
    this.hunger = data.hunger == null ? this.maxHunger : data.hunger
    this.dead = Boolean(data.dead)
    this._regenTimer = 0
    this._regenDelay = 0
    this._drownTimer = 0
    this._suffocationTimer = 0
    this._emit()
  }

  updateSuffocation(dt, isInBlock) {
    if (this.invincible || this.dead) { this._suffocationTimer = 0; return }
    if (!isInBlock) { this._suffocationTimer = 0; return }
    this._suffocationTimer += dt
    if (this._suffocationTimer >= SUFFOCATION_INTERVAL) {
      this._suffocationTimer -= SUFFOCATION_INTERVAL
      this.damage(SUFFOCATION_DAMAGE)
    }
  }

  consumeAir(dt) {
    if (this.invincible) {
      this.refillAir(dt)
      return
    }
    if (this.dead) return
    const before = this.air
    this.air = Math.max(0, this.air - AIR_DRAIN_RATE * dt)
    if (this.air <= 0) {
      this._drownTimer += dt
      if (this._drownTimer >= DROWN_INTERVAL) {
        this._drownTimer -= DROWN_INTERVAL
        this.damage(DROWN_DAMAGE)
      }
    }
    if (before !== this.air) this._emit()
  }

  refillAir(dt) {
    if (this.dead) return
    if (this.air >= this.maxAir) return
    this.air = Math.min(this.maxAir, this.air + AIR_REFILL_RATE * dt)
    this._drownTimer = 0
    this._emit()
  }

  update(dt) {
    if (this.dead) return
    if (this.spawnProtection > 0) this.spawnProtection = Math.max(0, this.spawnProtection - dt)
    if (this.hp < this.maxHp) {
      if (this._regenDelay > 0) {
        this._regenDelay = Math.max(0, this._regenDelay - dt)
      } else {
        this._regenTimer += dt
        if (this._regenTimer >= REGEN_INTERVAL) {
          this._regenTimer -= REGEN_INTERVAL
          this.heal(1)
        }
      }
    }
  }
}
