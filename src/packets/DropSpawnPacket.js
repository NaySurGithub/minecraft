import { Packet } from './Packet.js'
export class DropSpawnPacket extends Packet { constructor(data = {}) { super('DROP_SPAWN', data) } }
