import { Packet } from './Packet.js'
export class KickPacket extends Packet { constructor(data = {}) { super('KICK', data) } }
