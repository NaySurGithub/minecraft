import { Packet } from './Packet.js'
export class PlayerTeleportPacket extends Packet { constructor(data = {}) { super('PLAYER_TELEPORT', data) } }
