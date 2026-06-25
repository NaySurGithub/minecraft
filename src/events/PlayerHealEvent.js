import { GameEvent } from './GameEvent.js'
export class PlayerHealEvent extends GameEvent { constructor(detail = {}) { super('PlayerHealEvent', detail) } }
