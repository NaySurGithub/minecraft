import { Block } from '../Block.js'
export default class CarrotStage3 extends Block {
  constructor() {
    super({
      name: 'carrot_stage_3',
      solid: false,
      transparent: true,
      placeable: false,
      hardness: 0,
      label: 'Carrot',
      pattern: 'cross',
      color: [255, 140, 0],
      drops: 'carrot_item',
      category: 'crop'
    })
  }
}