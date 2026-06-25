import { Packet } from './Packet.js'
export class WorldLoadPacket extends Packet { constructor(data = {}) { super('WORLD_LOAD', data) } }
