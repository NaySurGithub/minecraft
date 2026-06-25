import { GameEvent } from './GameEvent.js'
export class ChunkUnloadEvent extends GameEvent { constructor(detail = {}) { super('ChunkUnloadEvent', detail) } }
