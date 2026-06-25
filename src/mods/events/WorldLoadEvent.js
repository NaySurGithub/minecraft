import { Event } from './Event.js'
export class WorldLoadEvent extends Event {
  constructor(detail = {}) { super('WorldLoadEvent', detail) }
}
