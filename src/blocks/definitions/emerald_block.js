import { Opaque } from '../Block.js'

export default class EmeraldBlock extends Opaque {
  constructor() {
    super({ name: 'emerald_block', hardness: 5, tool: 'pickaxe', label: 'Bloc d emeraude', pattern: 'solid', color: [70, 220, 110], drops: 'emerald_block' })
  }
}

