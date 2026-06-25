import { Packet } from './Packet.js'
export class ChunkDataPacket extends Packet { constructor(data = {}) { super('CHUNK_DATA', data) } }
