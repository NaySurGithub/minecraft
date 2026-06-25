import { Packet } from './Packet.js'
export class SpawnPacket extends Packet { constructor(data = {}) { super('SPAWN', data) } }
