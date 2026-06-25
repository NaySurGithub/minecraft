import { GameEvent } from './GameEvent.js'
export class CommandExecuteEvent extends GameEvent { constructor(detail = {}) { super('CommandExecuteEvent', detail) } }
