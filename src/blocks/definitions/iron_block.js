import { Opaque } from '../Block.js'

export default class IronBlock extends Opaque {
  constructor() {
    super({ name: 'iron_block', hardness: 5, tool: 'pickaxe', label: 'Bloc de fer', pattern: 'solid', color: [211, 211, 214], drops: 'iron_block' })
  }
}

