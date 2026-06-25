import { GameEvent } from './GameEvent.js'
export class PlayerRespawnEvent extends GameEvent { constructor(detail = {}) { super('PlayerRespawnEvent', detail) } }
