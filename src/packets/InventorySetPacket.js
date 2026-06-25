import { Packet } from './Packet.js'
export class InventorySetPacket extends Packet { constructor(data = {}) { super('INVENTORY_SET', data) } }
