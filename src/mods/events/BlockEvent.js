import { Event } from './Event.js'

export class BlockEvent extends Event {
  constructor(type, block, detail = {}) {
    super(type, detail)
    this.block = block
  }
}
