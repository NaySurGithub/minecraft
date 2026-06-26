import { Opaque } from '../Block.js'

export default class GoldBlock extends Opaque {
  constructor() {
    super({ name: 'gold_block', hardness: 5, tool: 'pickaxe', label: 'Block of Gold', pattern: 'solid', color: [246, 202, 74], drops: 'gold_block' })
  }
}

