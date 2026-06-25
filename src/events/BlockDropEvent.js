import { GameEvent } from './GameEvent.js'
export class BlockDropEvent extends GameEvent { constructor(detail = {}) { super('BlockDropEvent', detail) } }
