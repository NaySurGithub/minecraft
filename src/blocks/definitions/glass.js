import { Block } from '../Block.js'

export default class GlassBlock extends Block {
  constructor() {
    super({
      name: 'glass',
      hardness: 0.3,
      transparent: true,
      solid: true,
      label: 'Glass',
      pattern: 'glass',
      color: [200, 240, 255]
    })
  }
}
