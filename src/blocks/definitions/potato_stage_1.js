import { Block } from '../Block.js'
export default class PotatoStage1 extends Block {
  constructor() {
    super({
      name: 'potato_stage_1',
      solid: false,
      transparent: true,
      placeable: false,
      hardness: 0,
      label: 'Potato',
      pattern: 'cross',
      color: [200, 180, 100],
      drops: 'potato_seeds',
      category: 'crop'
    })
  }
}