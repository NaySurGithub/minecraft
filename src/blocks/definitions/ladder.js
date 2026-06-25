import { Block } from '../Block.js'

export default class LadderBlock extends Block {
  constructor() {
    super({
      name: 'ladder',
      solid: false,
      transparent: true,
      item: false,
      placeable: true,
      hardness: 0.4,
      tool: null,
      label: 'Ladder',
      pattern: 'solid',
      color: [160, 120, 70],
      renderType: 'model',
      model: 'ladder'
    })
  }
}
