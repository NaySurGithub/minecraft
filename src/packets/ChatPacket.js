import { Packet } from './Packet.js'
export class ChatPacket extends Packet { constructor(data = {}) { super('CHAT', data) } }
