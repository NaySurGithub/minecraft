import { Opaque } from '../Block.js'

export default class ChestBlock extends Opaque {
  constructor() {
    super({
      name: 'chest',
      hardness: 2.5,
      tool: 'axe',
      label: 'Chest',
      pattern: 'chest_side',
      faces: {
        top: 'chest_side',
        bottom: 'chest_side',
        left: 'chest_front',
        right: 'chest_side',
        side: 'chest_side'
      },
      color: [140, 100, 60],
      renderType: 'model',
      model: 'chest'
    })
  }
}
