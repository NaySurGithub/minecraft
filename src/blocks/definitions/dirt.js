import { Opaque } from '../Block.js'

export default class DirtBlock extends Opaque {
  constructor() {
    super({ name: 'dirt', hardness: 0.6, tool: 'shovel', label: 'Dirt', pattern: 'noise', color: [134, 96, 67], drops: 'dirt' })
  }
}

