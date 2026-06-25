import { Event } from './Event.js'
export class PacketSendEvent extends Event {
  constructor(detail = {}) { super('PacketSendEvent', detail) }
}
