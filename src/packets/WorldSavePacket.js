import { Packet } from './Packet.js'
export class WorldSavePacket extends Packet { constructor(data = {}) { super('WORLD_SAVE', data) } }
