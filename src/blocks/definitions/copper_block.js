import { Opaque } from '../Block.js'

export default class CopperBlock extends Opaque {
  constructor() {
    super({ name: 'copper_block', hardness: 5, tool: 'pickaxe', label: 'Block of Copper', pattern: 'solid', color: [210, 126, 82], drops: 'copper_block' })
  }
}

