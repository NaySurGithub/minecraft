import { GameEvent } from './GameEvent.js'
export class WorldGenEvent extends GameEvent { constructor(detail = {}) { super('WorldGenEvent', detail) } }
