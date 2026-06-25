export class InputController {
  constructor(domElement, player, keybindings) {
    this.dom = domElement
    this.player = player
    this.state = {
      forward: false,
      back: false,
      left: false,
      right: false,
      jump: false,
      sneak: false,
      sprint: false
    }
    this.locked = false
    this.onBreak = null
    this.onBreakRelease = null
    this.onPlace = null
    this.onJumpPressed = null
    this.canFly = null
    this.sensitivity = 0.0022
    this.invertY = false
    this._lastJumpTap = 0
    this.doubleTapWindow = 300
    this.movementActions = ['forward', 'back', 'left', 'right', 'jump', 'sneak', 'sprint']
    this.setKeybindings(keybindings)
    this._bind()
  }

  setKeybindings(keybindings) {
    this.keybindings = keybindings || {}
    this.codeToAction = {}
    for (const action of this.movementActions) {
      const code = this.keybindings[action]
      if (code) this.codeToAction[code] = action
    }
  }

  _bind() {
    window.addEventListener('keydown', (e) => this._key(e, true))
    window.addEventListener('keyup', (e) => this._key(e, false))
    this.dom.addEventListener('click', () => {
      if (!this.locked) this._requestPointerLock()
    })
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom
    })
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return
      this.player.yaw -= e.movementX * this.sensitivity
      this.player.pitch += e.movementY * this.sensitivity * (this.invertY ? 1 : -1)
      const limit = Math.PI / 2 - 0.01
      if (this.player.pitch > limit) this.player.pitch = limit
      if (this.player.pitch < -limit) this.player.pitch = -limit
    })
    this.dom.addEventListener('mousedown', (e) => {
      if (!this.locked) this._requestPointerLock()
      if (e.button === 0 && this.onBreak) this.onBreak()
      if (e.button === 2 && this.onPlace) this.onPlace()
      if (e.button === 1 && this.onPickBlock) this.onPickBlock()
    })
    this.dom.addEventListener('mouseup', (e) => {
      if (e.button === 0 && this.onBreakRelease) this.onBreakRelease()
    })
    window.addEventListener('blur', () => {
      if (this.onBreakRelease) this.onBreakRelease()
    })
    this.dom.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  _requestPointerLock() {
    const result = this.dom.requestPointerLock?.()
    if (result && typeof result.catch === 'function') result.catch(() => {})
  }

  jumpPressed() {
    if (this.onJumpPressed) this.onJumpPressed()
    const now = performance.now()
    if (now - this._lastJumpTap < this.doubleTapWindow) {
      if (!this.canFly || this.canFly()) {
        this.player.flying = !this.player.flying
      }
      this._lastJumpTap = 0
    } else {
      this._lastJumpTap = now
    }
  }

  _key(e, down) {
    const action = this.codeToAction[e.code]
    if (!action) return
    if (action === 'jump') {
      if (down && !this.state.jump) this.jumpPressed()
      this.state.jump = down
    } else {
      this.state[action] = down
    }
  }
}
