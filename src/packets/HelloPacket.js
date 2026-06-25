import { Packet } from './Packet.js'
export class HelloPacket extends Packet { constructor(data = {}) { super('HELLO', data) } }
