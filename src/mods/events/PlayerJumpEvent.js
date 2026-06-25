import { PlayerEvent } from './PlayerEvent.js'

export class PlayerJumpEvent extends PlayerEvent {
  constructor(player, detail = {}) {
    super('PlayerJumpEvent', player, detail)
  }
}
