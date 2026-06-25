// EffectsUI — renders active status effects at the middle-right of the screen.
// Effects stack vertically. Each card shows the icon, name, magnitude (roman), and a countdown timer.

function toRoman(n) {
  const map = [[10,'X'],[9,'IX'],[8,'VIII'],[7,'VII'],[6,'VI'],[5,'V'],[4,'IV'],[3,'III'],[2,'II'],[1,'I']]
  let result = ''
  for (const [v, s] of map) {
    while (n >= v) { result += s; n -= v }
  }
  return result
}

function formatTime(seconds) {
  const s = Math.ceil(Math.max(0, seconds))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return m > 0 ? `${m}:${String(rem).padStart(2, '0')}` : `${s}s`
}

export class EffectsUI {
  constructor(app) {
    this.app = app
    this.container = null
    this._build()
  }

  _build() {
    const el = document.createElement('div')
    el.id = 'effects-hud'
    this.app.appendChild(el)
    this.container = el
  }

  refresh(effects) {
    if (!this.container) return
    this.container.innerHTML = ''

    if (!effects || effects.length === 0) return

    for (const effect of effects) {
      const card = document.createElement('div')
      card.className = 'effect-card'
      card.style.setProperty('--effect-color', effect.color || '#aaaaaa')

      const iconEl = document.createElement('div')
      iconEl.className = 'effect-icon'
      iconEl.textContent = effect.icon || '✦'

      const info = document.createElement('div')
      info.className = 'effect-info'

      const nameLine = document.createElement('div')
      nameLine.className = 'effect-name'
      const roman = effect.magnitude > 1 ? ' ' + toRoman(effect.magnitude) : ''
      nameLine.textContent = effect.label + roman

      const timerEl = document.createElement('div')
      timerEl.className = 'effect-timer'
      timerEl.textContent = formatTime(effect.remaining)

      info.appendChild(nameLine)
      info.appendChild(timerEl)
      card.appendChild(iconEl)
      card.appendChild(info)
      this.container.appendChild(card)
    }
  }

  // Called each frame to update the timers without full re-render
  tick(effects) {
    if (!this.container) return
    const cards = this.container.querySelectorAll('.effect-card')
    for (let i = 0; i < cards.length && i < effects.length; i++) {
      const timerEl = cards[i].querySelector('.effect-timer')
      if (timerEl) timerEl.textContent = formatTime(effects[i].remaining)
    }
  }
}
