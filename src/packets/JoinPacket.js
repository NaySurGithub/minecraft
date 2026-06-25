import { Packet } from './Packet.js'
export class JoinPacket extends Packet { constructor(data = {}) { super('JOIN', data) } }
