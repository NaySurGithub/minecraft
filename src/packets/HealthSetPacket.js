import { Packet } from './Packet.js'
export class HealthSetPacket extends Packet { constructor(data = {}) { super('HEALTH_SET', data) } }
