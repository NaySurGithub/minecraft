import { Packet } from './Packet.js'
export class BlockUpdatePacket extends Packet { constructor(data = {}) { super('BLOCK_UPDATE', data) } }
