import { GameEvent } from './GameEvent.js'
export class PlayerDamageEvent extends GameEvent { constructor(detail = {}) { super('PlayerDamageEvent', detail) } }
