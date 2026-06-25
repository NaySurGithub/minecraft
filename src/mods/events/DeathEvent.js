import { PlayerEvent } from './PlayerEvent.js'
export class DeathEvent extends PlayerEvent {
  constructor(player, detail = {}) { super('DeathEvent', player, detail) }
}
