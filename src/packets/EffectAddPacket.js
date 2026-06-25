import { Packet } from './Packet.js'
export class EffectAddPacket extends Packet { constructor(data = {}) { super('EFFECT_ADD', data) } }
