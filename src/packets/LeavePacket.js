import { Packet } from './Packet.js'
export class LeavePacket extends Packet { constructor(data = {}) { super('LEAVE', data) } }
