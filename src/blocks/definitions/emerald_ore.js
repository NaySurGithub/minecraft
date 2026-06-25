import { Opaque } from '../Block.js'

export default class EmeraldOreBlock extends Opaque {
  constructor() {
    super({ name: 'emerald_ore', hardness: 3, tool: 'pickaxe', label: 'Minerai d emeraude', pattern: 'ore', color: [70, 220, 110], drops: 'emerald' })
  }
}

