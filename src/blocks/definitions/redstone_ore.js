import { Opaque } from '../Block.js'

export default class RedstoneOreBlock extends Opaque {
  constructor() {
    super({ name: 'redstone_ore', hardness: 3, tool: 'pickaxe', label: 'Redstone Ore', pattern: 'ore', color: [210, 42, 42], drops: 'redstone' })
  }
}

