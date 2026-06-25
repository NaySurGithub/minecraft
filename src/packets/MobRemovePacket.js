import { Packet } from './Packet.js'
export class MobRemovePacket extends Packet { constructor(data = {}) { super('MOB_REMOVE', data) } }
