import { Packet } from './Packet.js'
export class PlayerMovePacket extends Packet { constructor(data = {}) { super('PLAYER_MOVE', data) } }
