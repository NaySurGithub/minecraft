import { Packet } from './Packet.js'
export class AckPacket extends Packet { constructor(data = {}) { super('ACK', data) } }
