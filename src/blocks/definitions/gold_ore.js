import { Opaque } from '../Block.js'

export default class GoldOreBlock extends Opaque {
  constructor() {
    super({ name: 'gold_ore', hardness: 3, tool: 'pickaxe', label: 'Gold Ore', pattern: 'ore', color: [246, 202, 74], drops: 'raw_gold' })
  }
}

