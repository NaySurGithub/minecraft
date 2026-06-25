import { PlayerEvent } from './PlayerEvent.js'
export class PlayerRespawnEvent extends PlayerEvent {
  constructor(player, detail = {}) { super('PlayerRespawnEvent', player, detail) }
}
