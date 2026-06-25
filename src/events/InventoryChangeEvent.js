import { GameEvent } from './GameEvent.js'
export class InventoryChangeEvent extends GameEvent { constructor(detail = {}) { super('InventoryChangeEvent', detail) } }
