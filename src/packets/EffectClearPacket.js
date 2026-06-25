import { Packet } from './Packet.js'
export class EffectClearPacket extends Packet { constructor(data = {}) { super('EFFECT_CLEAR', data) } }
