import { Event } from './Event.js'
export class PacketReceiveEvent extends Event {
  constructor(detail = {}) { super('PacketReceiveEvent', detail) }
}
