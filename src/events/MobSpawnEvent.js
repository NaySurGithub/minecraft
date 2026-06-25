import { GameEvent } from './GameEvent.js'
export class MobSpawnEvent extends GameEvent { constructor(detail = {}) { super('MobSpawnEvent', detail) } }
