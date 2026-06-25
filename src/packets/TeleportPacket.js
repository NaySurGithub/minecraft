import { Packet } from './Packet.js'
export class TeleportPacket extends Packet { constructor(data = {}) { super('TELEPORT', data) } }
