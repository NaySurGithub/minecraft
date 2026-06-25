import { Block } from '../Block.js'

export default class RedstoneTorch extends Block {
  constructor() {
    super({
      name: 'redstone_torch',
      label: 'Redstone Torch',
      solid: false,
      transparent: true,
      hardness: 0,
      placeable: true,
      pattern: 'cross',
      color: [200, 40, 30],
      light: 7,
      renderType: 'model',
      model: 'redstone_torch',
      drops: 'redstone_torch'
    })
  }
}
