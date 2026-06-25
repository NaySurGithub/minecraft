import { Packet } from './Packet.js'
export class PlayerLeavePacket extends Packet { constructor(data = {}) { super('PLAYER_LEAVE', data) } }
