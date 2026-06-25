import { Packet } from './Packet.js'
export class PeerLeftPacket extends Packet { constructor(data = {}) { super('PEER_LEFT', data) } }
