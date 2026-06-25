import { Packet } from './Packet.js'
export class ScoreboardClearPacket extends Packet { constructor(data = {}) { super('SCOREBOARD_CLEAR', data) } }
