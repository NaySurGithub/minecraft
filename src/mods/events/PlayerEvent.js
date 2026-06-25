import { Event } from './Event.js'

export class PlayerEvent extends Event {
  constructor(type, player, detail = {}) {
    super(type, detail)
    this.player = player
  }
}
