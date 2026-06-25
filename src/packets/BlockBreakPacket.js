import { Packet } from './Packet.js'
export class BlockBreakPacket extends Packet { constructor(data = {}) { super('BLOCK_BREAK', data) } }
