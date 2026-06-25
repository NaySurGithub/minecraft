import { PlayerEvent } from './PlayerEvent.js'

export class PlayerMoveEvent extends PlayerEvent {
  constructor(player, detail = {}) {
    super('PlayerMoveEvent', player, detail)
  }
}
