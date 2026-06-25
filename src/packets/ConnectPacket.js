import { Packet } from './Packet.js'
export class ConnectPacket extends Packet { constructor(data = {}) { super('CONNECT', data) } }
