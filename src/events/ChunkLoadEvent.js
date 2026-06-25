import { GameEvent } from './GameEvent.js'
export class ChunkLoadEvent extends GameEvent { constructor(detail = {}) { super('ChunkLoadEvent', detail) } }
