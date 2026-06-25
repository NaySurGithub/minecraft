import { Opaque } from '../Block.js'

export default class PumpkinBlock extends Opaque {
  constructor() {
    super({ name: 'pumpkin', hardness: 1, tool: 'axe', label: 'Citrouille', pattern: 'pumpkin', color: [220, 120, 30], drops: 'pumpkin' })
  }
}

