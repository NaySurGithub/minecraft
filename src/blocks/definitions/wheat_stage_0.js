import { Block } from '../Block.js'
export default class WheatStage0 extends Block {
  constructor() {
    super({
      name: 'wheat_stage_0',
      solid: false,
      transparent: true,
      placeable: false,
      hardness: 0,
      label: 'Wheat Seeds',
      pattern: 'cross',
      color: [180, 160, 100],
      drops: 'wheat_seeds',
      category: 'crop'
    })
  }
}