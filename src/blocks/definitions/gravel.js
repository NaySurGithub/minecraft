import { Opaque } from '../Block.js'

export default class GravelBlock extends Opaque {
  constructor() {
    super({ name: 'gravel', hardness: 0.6, tool: 'shovel', label: 'Gravel', pattern: 'cobble', color: [136, 126, 120], gravity: true })
  }
}

