import { Event } from './Event.js'
export class JoinEvent extends Event {
  constructor(detail = {}) { super('JoinEvent', detail) }
}
