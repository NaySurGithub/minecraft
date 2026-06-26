import { Opaque } from '../Block.js'

export default class IronBlock extends Opaque {
  constructor() {
    super({ name: 'iron_block', hardness: 5, tool: 'pickaxe', label: 'Block of Iron', pattern: 'solid', color: [211, 211, 214], drops: 'iron_block' })
  }
}

