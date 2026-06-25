import { GameEvent } from './GameEvent.js'
export class ScoreChangeEvent extends GameEvent { constructor(detail = {}) { super('ScoreChangeEvent', detail) } }
