import { Block } from '../Block.js'

export default class Torch extends Block {
  constructor() {
    super({
      name: 'torch',
      label: 'Torch',
      solid: false,
      transparent: true,
      hardness: 0,
      placeable: true,
      pattern: 'cross',
      color: [255, 214, 100],
      light: 14,
      drops: 'torch'
    })
  }
}
