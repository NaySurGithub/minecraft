import { Packet } from './Packet.js'
export class PlayerStatePacket extends Packet { constructor(data = {}) { super('PLAYER_STATE', data) } }
