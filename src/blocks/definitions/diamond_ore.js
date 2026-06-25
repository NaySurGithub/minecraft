import { Opaque } from '../Block.js'

export default class DiamondOreBlock extends Opaque {
  constructor() {
    super({ name: 'diamond_ore', hardness: 3, tool: 'pickaxe', label: 'Minerai de diamant', pattern: 'ore', color: [90, 230, 230], drops: 'diamond' })
  }
}

