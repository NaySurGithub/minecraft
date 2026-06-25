import { GameEvent } from './GameEvent.js'
export class PlayerTeleportEvent extends GameEvent { constructor(detail = {}) { super('PlayerTeleportEvent', detail) } }
