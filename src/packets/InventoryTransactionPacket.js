import { Packet } from './Packet.js'

export class InventoryTransactionPacket extends Packet {
  constructor(data = {}) {
    super('InventoryTransactionPacket', data)
    this.detail = this.data
    this.cancelled = false
  }

  cancel() {
    this.cancelled = true
  }
}
