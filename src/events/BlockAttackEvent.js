import { GameEvent } from './GameEvent.js'
export class BlockAttackEvent extends GameEvent { constructor(detail = {}) { super('BlockAttackEvent', detail) } }
