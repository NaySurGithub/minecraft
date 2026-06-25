import { Packet } from './Packet.js'
export class MobUpdatePacket extends Packet { constructor(data = {}) { super('MOB_UPDATE', data) } }
