import { Packet } from './Packet.js'
export class ModPacket extends Packet { constructor(data = {}) { super('MOD_PACKET', data) } }
