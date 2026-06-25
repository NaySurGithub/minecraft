import { GAME_MODE } from '../config/constants.js'

export class Gamemode {
  constructor(initial) {
    this.mode = initial || GAME_MODE.SURVIVAL
    this.listeners = []
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

  set(mode) {
    if (mode !== GAME_MODE.SURVIVAL && mode !== GAME_MODE.CREATIVE && mode !== GAME_MODE.SPECTATOR) return
    if (this.mode === mode) return
    this.mode = mode
    this.emit()
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
