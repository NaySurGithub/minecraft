import { Packet } from './Packet.js'
export class EffectRemovePacket extends Packet { constructor(data = {}) { super('EFFECT_REMOVE', data) } }
