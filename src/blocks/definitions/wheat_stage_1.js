import { Block } from '../Block.js'
export default class WheatStage1 extends Block {
  constructor() {
    super({
      name: 'wheat_stage_1',
      solid: false,
      transparent: true,
      placeable: false,
      hardness: 0,
      label: 'Wheat',
      pattern: 'cross',
      color: [180, 160, 100],
      drops: 'wheat_seeds',
      category: 'crop'
    })
  }
}