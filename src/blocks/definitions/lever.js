import { Block } from '../Block.js'

export default class Lever extends Block {
  constructor() {
    super({
      name: 'lever',
      label: 'Lever',
      solid: false,
      transparent: true,
      hardness: 0.5,
      placeable: true,
      pattern: 'cross',
      color: [120, 100, 75],
      renderType: 'model',
      model: 'lever',
      drops: 'lever'
    })
  }
}
