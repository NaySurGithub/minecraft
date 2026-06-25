import { Packet } from './Packet.js'
export class GamemodePacket extends Packet { constructor(data = {}) { super('GAMEMODE', data) } }
