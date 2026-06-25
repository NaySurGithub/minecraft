import { Opaque } from '../Block.js'

export default class DiamondBlock extends Opaque {
  constructor() {
    super({ name: 'diamond_block', hardness: 5, tool: 'pickaxe', label: 'Bloc de diamant', pattern: 'solid', color: [90, 230, 230], drops: 'diamond_block' })
  }
}

