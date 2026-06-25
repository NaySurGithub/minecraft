import { GameEvent } from './GameEvent.js'
export class PlayerAttackEvent extends GameEvent { constructor(detail = {}) { super('PlayerAttackEvent', detail) } }
