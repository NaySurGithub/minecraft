import { Packet } from './Packet.js'
export class PlayerJoinPacket extends Packet { constructor(data = {}) { super('PLAYER_JOIN', data) } }
