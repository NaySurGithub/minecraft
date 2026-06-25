import { GameEvent } from './GameEvent.js'
export class BiomeChangeEvent extends GameEvent { constructor(detail = {}) { super('BiomeChangeEvent', detail) } }
