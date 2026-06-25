import { Event } from './Event.js'
export class LeaveEvent extends Event {
  constructor(detail = {}) { super('LeaveEvent', detail) }
}
