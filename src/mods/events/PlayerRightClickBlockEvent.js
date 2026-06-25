import { PlayerEvent } from './PlayerEvent.js'

export class PlayerRightClickBlockEvent extends PlayerEvent {
  constructor(player, detail = {}) {
    super('PlayerRightClickBlockEvent', player, detail)
  }
}
