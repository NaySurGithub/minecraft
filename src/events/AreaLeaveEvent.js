import { GameEvent } from './GameEvent.js'
export class AreaLeaveEvent extends GameEvent { constructor(detail = {}) { super('AreaLeaveEvent', detail) } }
