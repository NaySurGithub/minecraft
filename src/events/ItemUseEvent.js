import { GameEvent } from './GameEvent.js'
export class ItemUseEvent extends GameEvent { constructor(detail = {}) { super('ItemUseEvent', detail) } }
