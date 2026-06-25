import { GameEvent } from './GameEvent.js'
export class WorldSaveEvent extends GameEvent { constructor(detail = {}) { super('WorldSaveEvent', detail) } }
