export class TouchControls {
  constructor(app, input, player, actions, layout, onLayoutChange) {
    this.app = app
    this.input = input
    this.player = player
    this.actions = actions
    this.layout = layout || {}
    this.onLayoutChange = onLayoutChange || null
    this.editing = false
    this.lookId = null
    this.lookLast = { x: 0, y: 0 }
    this.joyId = null
    this.joyCenter = { x: 0, y: 0 }
    this.joyMax = 46
    this.joyMoveStart = 0
    this.sprintHoldMs = 2000
    this.sensitivity = 0.005
    this.invertY = false
    this.buttonEls = {}
    this._build()
  }

  _applyButtonPosition(id, btn) {
    const pos = this.layout[id]
    if (!pos) return
    btn.style.position = 'fixed'
    btn.style.left = pos.x + '%'
    btn.style.top = pos.y + '%'
    btn.style.right = 'auto'
    btn.style.bottom = 'auto'
    btn.style.transform = 'translate(-50%, -50%)'
  }

  applyLayout(layout) {
    if (layout) this.layout = layout
    for (const id in this.buttonEls) {
      this._applyButtonPosition(id, this.buttonEls[id])
    }
  }

  setEditing(on) {
    this.editing = !!on
    for (const id in this.buttonEls) {
      this.buttonEls[id].classList.toggle('editing', this.editing)
    }
    if (this.sneakBtn) this.sneakBtn.classList.toggle('editing', this.editing)
  }

  _build() {
    const joyZone = document.createElement('div')
    joyZone.id = 'joyzone'
    const joyKnob = document.createElement('div')
    joyKnob.id = 'joyknob'
    joyZone.appendChild(joyKnob)
    this.app.appendChild(joyZone)
    this.joyKnob = joyKnob
    this.joyZone = joyZone
    this._updateJoyCenter()

    const buttons = document.createElement('div')
    buttons.id = 'touchbuttons'
    const defs = [
      ['↑', () => {}, 'jump', 'Sauter'],
      ['⌖', () => this.actions.onPlace && this.actions.onPlace(), 'place', 'Placer'],
      ['⛏', () => {}, 'break', 'Casser']
    ]
    for (const def of defs) {
      const btn = document.createElement('div')
      btn.className = 'touchbtn'
      btn.textContent = def[0]
      btn.setAttribute('aria-label', def[3])
      const id = def[2]
      if (id === 'jump') {
        btn.addEventListener('touchstart', (e) => { if (this.editing) return; e.preventDefault(); this.input.jumpPressed(); this.input.state.jump = true })
        btn.addEventListener('touchend', (e) => { if (this.editing) return; e.preventDefault(); this.input.state.jump = false })
      } else if (id === 'break') {
        btn.addEventListener('touchstart', (e) => { if (this.editing) return; e.preventDefault(); this.actions.onBreak && this.actions.onBreak() })
        btn.addEventListener('touchend', (e) => { if (this.editing) return; e.preventDefault(); this.actions.onBreakRelease && this.actions.onBreakRelease() })
        btn.addEventListener('touchcancel', (e) => { if (this.editing) return; e.preventDefault(); this.actions.onBreakRelease && this.actions.onBreakRelease() })
      } else {
        btn.addEventListener('touchstart', (e) => { if (this.editing) return; e.preventDefault(); def[1]() })
      }
      this.buttonEls[id] = btn
      this._applyButtonPosition(id, btn)
      this._makeDraggable(id, btn)
      buttons.appendChild(btn)
    }
    this.app.appendChild(buttons)

    this._buildSneakButton()

    window.addEventListener('resize', () => this._updateJoyCenter())
    window.addEventListener('touchstart', (e) => this._onStart(e), { passive: false })
    window.addEventListener('touchmove', (e) => this._onMove(e), { passive: false })
    window.addEventListener('touchend', (e) => this._onEnd(e), { passive: false })
    window.addEventListener('touchcancel', (e) => this._onEnd(e), { passive: false })
  }

  _makeDraggable(id, btn) {
    let dragId = null
    btn.addEventListener('touchstart', (e) => {
      if (!this.editing) return
      e.preventDefault()
      e.stopPropagation()
      dragId = e.changedTouches[0].identifier
    }, { passive: false })
    btn.addEventListener('touchmove', (e) => {
      if (!this.editing || dragId === null) return
      e.preventDefault()
      e.stopPropagation()
      for (const tch of e.changedTouches) {
        if (tch.identifier !== dragId) continue
        const x = (tch.clientX / window.innerWidth) * 100
        const y = (tch.clientY / window.innerHeight) * 100
        const cx = Math.max(4, Math.min(96, x))
        const cy = Math.max(4, Math.min(96, y))
        this.layout[id] = { x: cx, y: cy }
        this._applyButtonPosition(id, btn)
      }
    }, { passive: false })
    const endDrag = (e) => {
      if (dragId === null) return
      let ended = false
      for (const tch of e.changedTouches) {
        if (tch.identifier === dragId) ended = true
      }
      if (!ended) return
      dragId = null
      if (this.onLayoutChange) this.onLayoutChange(this.layout)
    }
    btn.addEventListener('touchend', endDrag, { passive: false })
    btn.addEventListener('touchcancel', endDrag, { passive: false })
  }

  _updateJoyCenter() {
    const rect = this.joyZone.getBoundingClientRect()
    this.joyCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    }
  }

  _buildSneakButton() {
    const btn = document.createElement('div')
    btn.id = 'sneakbtn'
    btn.className = 'touchbtn'
    btn.textContent = '⇩'
    btn.setAttribute('aria-label', 'Sneak')
    this.sneakLocked = false
    this.sneakBtn = btn
    this._sneakPressStart = 0
    this.buttonEls.sneak = btn

    const HOLD_MS = 250

    btn.addEventListener('touchstart', (e) => {
      if (this.editing) return
      e.preventDefault()
      e.stopPropagation()
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
      this._sneakPressStart = now
      this.input.state.sneak = true
      btn.classList.add('active')
    }, { passive: false })

    const release = (e) => {
      if (this.editing) return
      if (e) { e.preventDefault(); e.stopPropagation() }
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
      const heldFor = now - this._sneakPressStart
      btn.classList.remove('active')
      if (heldFor < HOLD_MS) {
        this.sneakLocked = !this.sneakLocked
        this.input.state.sneak = this.sneakLocked
        btn.classList.toggle('locked', this.sneakLocked)
      } else {
        this.input.state.sneak = this.sneakLocked
      }
    }
    btn.addEventListener('touchend', release, { passive: false })
    btn.addEventListener('touchcancel', release, { passive: false })

    this._applyButtonPosition('sneak', btn)
    this._makeDraggable('sneak', btn)
    this.app.appendChild(btn)
  }

  _isUiTouch(target) {
    return Boolean(target.closest('#touchbuttons, .touchbtn, .mc-open-btn, .mc-overlay, #invoverlay, #tableoverlay, .overlay'))
  }

  _onStart(e) {
    if (this.editing) return
    for (const t of e.changedTouches) {
      if (this._isUiTouch(t.target)) continue
      const half = window.innerWidth / 2
      if (t.clientX < half && this.joyId === null) {
        this.joyId = t.identifier
        this._updateJoyCenter()
        this._moveJoystick(t)
      } else if (t.clientX >= half && this.lookId === null) {
        this.lookId = t.identifier
        this.lookLast = { x: t.clientX, y: t.clientY }
      }
    }
  }

  _onMove(e) {
    if (this.editing) return
    e.preventDefault()
    for (const t of e.changedTouches) {
      if (t.identifier === this.joyId) {
        this._moveJoystick(t)
      } else if (t.identifier === this.lookId) {
        const dx = t.clientX - this.lookLast.x
        const dy = t.clientY - this.lookLast.y
        this.lookLast = { x: t.clientX, y: t.clientY }
        this.player.yaw -= dx * this.sensitivity
        this.player.pitch += dy * this.sensitivity * (this.invertY ? 1 : -1)
        const limit = Math.PI / 2 - 0.01
        if (this.player.pitch > limit) this.player.pitch = limit
        if (this.player.pitch < -limit) this.player.pitch = -limit
      }
    }
  }

  _onEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this.joyId) {
        this.joyId = null
        this.joyKnob.style.transform = 'translate(0,0)'
        this.input.state.forward = false
        this.input.state.back = false
        this.input.state.left = false
        this.input.state.right = false
        this.joyMoveStart = 0
        this.input.state.sprint = false
      } else if (t.identifier === this.lookId) {
        this.lookId = null
      }
    }
  }

  _moveJoystick(t) {
    const dx = t.clientX - this.joyCenter.x
    const dy = t.clientY - this.joyCenter.y
    const len = Math.hypot(dx, dy)
    const scale = len > this.joyMax ? this.joyMax / len : 1
    const cdx = dx * scale
    const cdy = dy * scale
    this.joyKnob.style.transform = 'translate(' + cdx + 'px,' + cdy + 'px)'
    const nx = cdx / this.joyMax
    const ny = cdy / this.joyMax
    this.input.state.forward = ny < -0.3
    this.input.state.back = ny > 0.3
    this.input.state.left = nx < -0.3
    this.input.state.right = nx > 0.3
    const moving = this.input.state.forward || this.input.state.back || this.input.state.left || this.input.state.right
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
    if (moving) {
      if (this.joyMoveStart === 0) this.joyMoveStart = now
      if (now - this.joyMoveStart >= this.sprintHoldMs) this.input.state.sprint = true
    } else {
      this.joyMoveStart = 0
      this.input.state.sprint = false
    }
  }
}
