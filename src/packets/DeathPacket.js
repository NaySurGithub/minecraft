import { Packet } from './Packet.js'
export class DeathPacket extends Packet { constructor(data = {}) { super('DEATH', data) } }
