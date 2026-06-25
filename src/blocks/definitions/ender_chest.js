import { Opaque } from '../Block.js'

export default class EnderChestBlock extends Opaque {
  constructor() {
    super({
      name: 'ender_chest',
      hardness: 2.5,
      tool: 'pickaxe',
      label: 'Ender Chest',
      pattern: 'chest_side',
      faces: {
        top: 'chest_side',
        bottom: 'chest_side',
        left: 'chest_front',
        right: 'chest_side',
        side: 'chest_side'
      },
      color: [35, 20, 45],
      renderType: 'model',
      model: 'chest'
    })
  }
}
