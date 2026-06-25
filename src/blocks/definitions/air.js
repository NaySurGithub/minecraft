import { Block } from '../Block.js'

export default class AirBlock extends Block {
  constructor() {
    super({
      name: 'air',
      solid: false,
      transparent: true,
      placeable: false,
      label: 'Air',
      pattern: 'air'
    })
  }
}

