import { GameEvent } from './GameEvent.js'
export class LeaveEvent extends GameEvent { constructor(detail = {}) { super('LeaveEvent', detail) } }
