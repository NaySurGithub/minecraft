import { Packet } from './Packet.js'
export class ZoneUpdatePacket extends Packet { constructor(data = {}) { super('ZONE_UPDATE', data) } }
