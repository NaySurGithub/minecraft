import { Opaque } from '../Block.js'

export default class NetherrackBlock extends Opaque {
  constructor() {
    super({
      name: 'netherrack',
      hardness: 0.4,
      tool: 'pickaxe',
      label: 'Netherrack',
      pattern: 'stone',
      color: [116, 42, 42],
      drops: 'netherrack'
    })
  }
}
