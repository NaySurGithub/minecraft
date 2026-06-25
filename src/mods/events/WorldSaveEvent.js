import { Event } from './Event.js'
export class WorldSaveEvent extends Event {
  constructor(detail = {}) { super('WorldSaveEvent', detail) }
}
