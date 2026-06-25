import { Packet } from './Packet.js'
export class ScoreboardSetPacket extends Packet { constructor(data = {}) { super('SCOREBOARD_SET', data) } }
