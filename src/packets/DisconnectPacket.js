import { Packet } from './Packet.js'
export class DisconnectPacket extends Packet { constructor(data = {}) { super('DISCONNECT', data) } }
