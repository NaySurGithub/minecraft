import { Opaque } from '../Block.js'

export default class CoalOreBlock extends Opaque {
  constructor() {
    super({ name: 'coal_ore', hardness: 3, tool: 'pickaxe', label: 'Coal Ore', pattern: 'ore', color: [60, 60, 64], drops: 'coal' })
  }
}

