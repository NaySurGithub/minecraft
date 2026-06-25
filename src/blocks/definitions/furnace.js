import { Opaque } from '../Block.js'

export default class FurnaceBlock extends Opaque {
  constructor() {
    super({
      name: 'furnace',
      hardness: 3.5,
      tool: 'pickaxe',
      label: 'Furnace',
      pattern: 'solid',
      color: [122, 122, 122],
      renderType: 'model',
      model: 'furnace',
      drops: 'furnace'
    })
  }
}
