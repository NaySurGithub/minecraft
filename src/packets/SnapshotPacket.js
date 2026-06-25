import { Packet } from './Packet.js'
export class SnapshotPacket extends Packet { constructor(data = {}) { super('SNAPSHOT', data) } }
