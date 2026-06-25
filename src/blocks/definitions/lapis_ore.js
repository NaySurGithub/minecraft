import { Opaque } from '../Block.js'

export default class LapisOreBlock extends Opaque {
  constructor() {
    super({ name: 'lapis_ore', hardness: 3, tool: 'pickaxe', label: 'Minerai de lapis', pattern: 'ore', color: [58, 86, 210], drops: 'lapis_lazuli' })
  }
}

