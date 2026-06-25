import { Opaque } from '../Block.js'

export default class IronOreBlock extends Opaque {
  constructor() {
    super({ name: 'iron_ore', hardness: 3, tool: 'pickaxe', label: 'Minerai de fer', pattern: 'ore', color: [196, 150, 120], drops: 'raw_iron' })
  }
}

