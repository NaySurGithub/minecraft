import { Packet } from './Packet.js'
export class CommandPacket extends Packet { constructor(data = {}) { super('COMMAND', data) } }
