import { Opaque } from '../Block.js'
export default class FarmlandBlock extends Opaque {
  constructor() {
    super({
      name: 'farmland',
      hardness: 0.6,
      tool: 'shovel',
      label: 'Farmland',
      pattern: 'solid',
      color: [105, 75, 45],
      drops: 'dirt'
    })
  }
}
