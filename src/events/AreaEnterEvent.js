import { GameEvent } from './GameEvent.js'
export class AreaEnterEvent extends GameEvent { constructor(detail = {}) { super('AreaEnterEvent', detail) } }
