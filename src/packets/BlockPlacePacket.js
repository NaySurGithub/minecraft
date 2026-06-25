import { Packet } from './Packet.js'
export class BlockPlacePacket extends Packet { constructor(data = {}) { super('BLOCK_PLACE', data) } }
