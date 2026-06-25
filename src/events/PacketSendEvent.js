import { GameEvent } from './GameEvent.js'
export class PacketSendEvent extends GameEvent { constructor(detail = {}) { super('PacketSendEvent', detail) } }
