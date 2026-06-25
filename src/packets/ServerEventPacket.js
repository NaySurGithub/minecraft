import { Packet } from './Packet.js'
export class ServerEventPacket extends Packet { constructor(data = {}) { super('SERVER_EVENT', data) } }
