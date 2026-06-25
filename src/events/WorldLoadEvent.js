import { GameEvent } from './GameEvent.js'
export class WorldLoadEvent extends GameEvent { constructor(detail = {}) { super('WorldLoadEvent', detail) } }
