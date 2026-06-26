import { Opaque } from '../Block.js'

export default class LapisBlock extends Opaque {
  constructor() {
    super({ name: 'lapis_block', hardness: 5, tool: 'pickaxe', label: 'Block of Lapis Lazuli', pattern: 'solid', color: [58, 86, 210], drops: 'lapis_block' })
  }
}

