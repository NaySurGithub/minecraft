import { Packet } from './Packet.js'
export class MobSpawnPacket extends Packet { constructor(data = {}) { super('MOB_SPAWN', data) } }
