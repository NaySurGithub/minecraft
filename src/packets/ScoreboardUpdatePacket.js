import { Packet } from './Packet.js'
export class ScoreboardUpdatePacket extends Packet { constructor(data = {}) { super('SCOREBOARD_UPDATE', data) } }
