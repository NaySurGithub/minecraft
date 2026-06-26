import { Opaque } from '../Block.js'

export default class EmeraldBlock extends Opaque {
  constructor() {
    super({ name: 'emerald_block', hardness: 5, tool: 'pickaxe', label: 'Block of Emerald', pattern: 'solid', color: [70, 220, 110], drops: 'emerald_block' })
  }
}

