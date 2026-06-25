import { GameEvent } from './GameEvent.js'
export class JoinEvent extends GameEvent { constructor(detail = {}) { super('JoinEvent', detail) } }
