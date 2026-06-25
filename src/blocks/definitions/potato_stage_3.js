import { Block } from '../Block.js'
export default class PotatoStage3 extends Block {
  constructor() {
    super({
      name: 'potato_stage_3',
      solid: false,
      transparent: true,
      placeable: false,
      hardness: 0,
      label: 'Potato',
      pattern: 'cross',
      color: [200, 180, 100],
      drops: 'potato_item',
      category: 'crop'
    })
  }
}