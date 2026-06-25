import { Opaque } from '../Block.js'

export default class RedstoneBlock extends Opaque {
  constructor() {
    super({
      name: 'redstone_block',
      label: 'Block of Redstone',
      hardness: 5,
      tool: 'pickaxe',
      color: [171, 27, 9],
      pattern: 'solid',
      drops: 'redstone_block'
    })
  }
}
