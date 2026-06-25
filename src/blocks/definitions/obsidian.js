import { Opaque } from '../Block.js'

export default class ObsidianBlock extends Opaque {
  constructor() {
    super({
      name: 'obsidian',
      hardness: 50,
      tool: 'pickaxe',
      label: 'Obsidian',
      pattern: 'cobble',
      color: [25, 15, 35]
    })
  }
}
