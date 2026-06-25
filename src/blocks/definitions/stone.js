import { Opaque } from '../Block.js'

export default class StoneBlock extends Opaque {
  constructor() {
    super({ name: 'stone', hardness: 1.5, tool: 'pickaxe', label: 'Pierre', pattern: 'noise', color: [122, 122, 128], drops: 'cobblestone' })
  }
}

