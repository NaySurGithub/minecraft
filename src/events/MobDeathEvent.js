import { GameEvent } from './GameEvent.js'
export class MobDeathEvent extends GameEvent { constructor(detail = {}) { super('MobDeathEvent', detail) } }
