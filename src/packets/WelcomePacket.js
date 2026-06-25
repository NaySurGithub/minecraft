import { Packet } from './Packet.js'
export class WelcomePacket extends Packet { constructor(data = {}) { super('WELCOME', data) } }
