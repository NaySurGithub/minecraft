import { Block } from '../Block.js'

export default class FireBlock extends Block {
  constructor() {
    super({
      name: 'fire',
      solid: false,
      transparent: true,
      placeable: false,
      hardness: -1,
      label: 'Fire',
      pattern: 'cross',
      color: [255, 150, 40],
      light: 12,
      drops: null
    })
  }
}
