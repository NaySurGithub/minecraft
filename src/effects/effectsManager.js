// EffectsManager — manages timed status effects on the player.
// Effects are plain objects: { id, label, icon, color, duration, remaining, magnitude }
// magnitude >= 1 (amplifier 0 in Minecraft terms = magnitude 1 = level I)

const EFFECT_DEFS = {
  speed: {
    label: 'Speed',
    icon: '💨',
    color: '#7cafc2',
    tick(dt, context) {
      // Applied to player walkSpeed multiplier each frame via effectsManager.getSpeedMult()
    }
  },
  slowness: {
    label: 'Slowness',
    icon: '🐢',
    color: '#5a6c81',
    tick(dt, context) {}
  },
  strength: {
    label: 'Strength',
    icon: '⚔️',
    color: '#932423',
    tick(dt, context) {}
  },
  regeneration: {
    label: 'Regeneration',
    icon: '❤️',
    color: '#cd5cab',
    tickInterval: 2.5,
    tick(dt, context, effect) {
      effect._regenTimer = (effect._regenTimer || 0) + dt
      const interval = 2.5 / effect.magnitude
      if (effect._regenTimer >= interval) {
        effect._regenTimer = 0
        if (context.health && !context.health.dead) context.health.heal(1)
      }
    }
  },
  poison: {
    label: 'Poison',
    icon: '☠️',
    color: '#4e9331',
    tick(dt, context, effect) {
      effect._poisonTimer = (effect._poisonTimer || 0) + dt
      const interval = 1.25 / effect.magnitude
      if (effect._poisonTimer >= interval) {
        effect._poisonTimer = 0
        if (context.health && context.health.hp > 1) {
          context.health.damage(1)
        }
      }
    }
  },
  haste: {
    label: 'Haste',
    icon: '⛏️',
    color: '#d9c043',
    tick(dt, context) {}
  },
  resistance: {
    label: 'Resistance',
    icon: '🛡️',
    color: '#99453a',
    tick(dt, context) {}
  },
  fire_resistance: {
    label: 'Fire Resistance',
    icon: '🔥',
    color: '#e49a3a',
    tick(dt, context) {}
  },
  invisibility: {
    label: 'Invisibility',
    icon: '👻',
    color: '#7f8192',
    tick(dt, context) {}
  },
  night_vision: {
    label: 'Night Vision',
    icon: '👁️',
    color: '#1f1fa1',
    tick(dt, context) {}
  },
  jump_boost: {
    label: 'Jump Boost',
    icon: '🦘',
    color: '#786297',
    tick(dt, context) {}
  },
  saturation: {
    label: 'Saturation',
    icon: '🍗',
    color: '#f82423',
    tick(dt, context, effect) {
      effect._satTimer = (effect._satTimer || 0) + dt
      if (effect._satTimer >= 1) {
        effect._satTimer = 0
        if (context.health) {
          context.health.hunger = Math.min(
            context.health.maxHunger,
            (context.health.hunger || 0) + effect.magnitude
          )
        }
      }
    }
  }
}

export const EFFECT_IDS = Object.keys(EFFECT_DEFS)

export class EffectsManager {
  constructor() {
    this.effects = [] // array of active { id, label, icon, color, duration, remaining, magnitude, _timers... }
    this.onChanged = null // callback for UI refresh
  }

  addEffect(id, duration, magnitude = 1) {
    const def = EFFECT_DEFS[id]
    if (!def) return false

    // If already active, replace/stack (take max magnitude, refresh duration)
    const existing = this.effects.find(e => e.id === id)
    if (existing) {
      existing.remaining = Math.max(existing.remaining, duration)
      existing.magnitude = Math.max(existing.magnitude, magnitude)
    } else {
      this.effects.push({
        id,
        label: def.label,
        icon: def.icon,
        color: def.color,
        duration,
        remaining: duration,
        magnitude,
        _regenTimer: 0,
        _poisonTimer: 0,
        _satTimer: 0
      })
    }
    if (this.onChanged) this.onChanged(this.effects)
    return true
  }

  removeEffect(id) {
    const before = this.effects.length
    this.effects = this.effects.filter(e => e.id !== id)
    if (this.effects.length !== before && this.onChanged) this.onChanged(this.effects)
    return this.effects.length !== before
  }

  clearAll() {
    if (this.effects.length === 0) return
    this.effects = []
    if (this.onChanged) this.onChanged(this.effects)
  }

  hasEffect(id) {
    return this.effects.some(e => e.id === id)
  }

  getMagnitude(id) {
    const e = this.effects.find(e => e.id === id)
    return e ? e.magnitude : 0
  }

  getSpeedMult() {
    let mult = 1
    if (this.hasEffect('speed')) mult += 0.2 * this.getMagnitude('speed')
    if (this.hasEffect('slowness')) mult -= 0.15 * this.getMagnitude('slowness')
    return Math.max(0.1, mult)
  }

  getBreakSpeedMult() {
    let mult = 1
    if (this.hasEffect('haste')) mult += 0.2 * this.getMagnitude('haste')
    return mult
  }

  getJumpMult() {
    let mult = 1
    if (this.hasEffect('jump_boost')) mult += 0.4 * this.getMagnitude('jump_boost')
    return mult
  }

  getStrengthBonus() {
    if (this.hasEffect('strength')) return 3 * this.getMagnitude('strength')
    return 0
  }

  getDamageReduction() {
    if (this.hasEffect('resistance')) return Math.min(0.8, 0.2 * this.getMagnitude('resistance'))
    return 0
  }

  isFireResistant() {
    return this.hasEffect('fire_resistance')
  }

  update(dt, context) {
    let changed = false
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]
      e.remaining -= dt
      const def = EFFECT_DEFS[e.id]
      if (def && def.tick) def.tick(dt, context, e)
      if (e.remaining <= 0) {
        this.effects.splice(i, 1)
        changed = true
      }
    }
    if (changed && this.onChanged) this.onChanged(this.effects)
  }
}
