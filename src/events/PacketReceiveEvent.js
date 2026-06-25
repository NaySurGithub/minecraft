import { GameEvent } from './GameEvent.js'
export class PacketReceiveEvent extends GameEvent { constructor(detail = {}) { super('PacketReceiveEvent', detail) } }
