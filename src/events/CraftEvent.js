import { GameEvent } from './GameEvent.js'
export class CraftEvent extends GameEvent { constructor(detail = {}) { super('CraftEvent', detail) } }
