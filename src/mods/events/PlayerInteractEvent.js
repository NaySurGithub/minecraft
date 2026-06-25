import { PlayerEvent } from './PlayerEvent.js'

export class PlayerInteractEvent extends PlayerEvent {
  constructor(player, detail = {}) {
    super('PlayerInteractEvent', player, detail)
  }
}
