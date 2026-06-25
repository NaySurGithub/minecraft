import { Opaque } from '../Block.js'

export default class CopperOreBlock extends Opaque {
  constructor() {
    super({ name: 'copper_ore', hardness: 3, tool: 'pickaxe', label: 'Minerai de cuivre', pattern: 'ore', color: [210, 126, 82], drops: 'raw_copper' })
  }
}

