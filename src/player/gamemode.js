import { GAME_MODE } from '../config/constants.js'

// Same tamper hardening as Inventory: lock gameplay methods onto the
// prototype so DevTools monkey-patching (gamemode.set = () => {}, or
// Gamemode.prototype.canFly = () => true) throws instead of silently
// changing behavior for everyone holding a reference.
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

export class Gamemode {
  constructor(initial) {
    this.mode = initial || GAME_MODE.SURVIVAL
    this.listeners = []
    // In multiplayer client mode, the host is authoritative for this
    // value (see net/hostSession.js GAMEMODE_SET handling). This flag
    // is set by the game bootstrap when running as a non-host client;
    // it does not change what code in this file can do (set() always
    // works locally, same as before) but lets UI/commands know to ask
    // the host instead of changing this object directly.
    this.hostAuthoritative = false
  }

  onChange(fn) {
    this.listeners.push(fn)
  }

  emit() {
    for (const fn of this.listeners) fn(this.mode)
  }

  get() {
    return this.mode
  }

  // Authoritative local mutation. Solo play and the host call this
  // directly. Clients should call requestChange() instead (see
  // net/clientSession.js) and apply the host's confirmation via
  // applyFromHost().
  set(mode) {
    if (mode !== GAME_MODE.SURVIVAL && mode !== GAME_MODE.CREATIVE && mode !== GAME_MODE.SPECTATOR) return
    if (this.mode === mode) return
    this.mode = mode
    this.emit()
  }

  // Called only when a GAMEMODE_SET packet arrives from the host.
  // Functionally identical to set() today, but kept distinct so it is
  // obvious at every call site whether a change is locally-initiated
  // (trusted, host/solo) or host-confirmed (trusted, client).
  applyFromHost(mode) {
    this.set(mode)
  }

  toggle() {
    this.set(this.mode === GAME_MODE.SURVIVAL ? GAME_MODE.CREATIVE : GAME_MODE.SURVIVAL)
    return this.mode
  }

  isCreative() {
    return this.mode === GAME_MODE.CREATIVE
  }

  isSurvival() {
    return this.mode === GAME_MODE.SURVIVAL
  }

  isSpectator() {
    return this.mode === GAME_MODE.SPECTATOR
  }

  canFly() {
    return this.mode === GAME_MODE.CREATIVE || this.mode === GAME_MODE.SPECTATOR
  }

  takesFallDamage() {
    return this.mode === GAME_MODE.SURVIVAL
  }

  instantBreak() {
    return this.mode === GAME_MODE.CREATIVE
  }

  dropsOnBreak() {
    return this.mode === GAME_MODE.SURVIVAL
  }

  consumesPlaced() {
    return this.mode === GAME_MODE.SURVIVAL
  }

  breakSpeedMultiplier() {
    return this.mode === GAME_MODE.CREATIVE ? Infinity : 1
  }

  // Spectator: cannot modify the world in any way
  canBreak() {
    return this.mode !== GAME_MODE.SPECTATOR
  }

  canPlace() {
    return this.mode !== GAME_MODE.SPECTATOR
  }

  canInteract() {
    return this.mode !== GAME_MODE.SPECTATOR
  }

  // Spectator passes through solid blocks (noclip)
  hasCollision() {
    return this.mode !== GAME_MODE.SPECTATOR
  }

  // Spectator is invisible to other players in multiplayer
  isVisible() {
    return this.mode !== GAME_MODE.SPECTATOR
  }
}

lockMethods(Gamemode, [
  'onChange', 'emit', 'get', 'set', 'applyFromHost', 'toggle',
  'isCreative', 'isSurvival', 'isSpectator', 'canFly', 'takesFallDamage',
  'instantBreak', 'dropsOnBreak', 'consumesPlaced', 'breakSpeedMultiplier',
  'canBreak', 'canPlace', 'canInteract', 'hasCollision', 'isVisible'
])
