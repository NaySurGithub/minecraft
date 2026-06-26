import { Opaque } from '../Block.js'

export default class CobblestoneBlock extends Opaque {
  constructor() {
    super({ name: 'cobblestone', hardness: 2, tool: 'pickaxe', label: 'Cobblestone', pattern: 'cobble', color: [110, 110, 116] })
  }
}

