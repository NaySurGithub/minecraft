import { GameEvent } from './GameEvent.js'
export class DeathEvent extends GameEvent { constructor(detail = {}) { super('DeathEvent', detail) } }
