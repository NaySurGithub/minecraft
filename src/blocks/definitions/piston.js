import { Opaque } from '../Block.js'

export default class PistonBlock extends Opaque {
  constructor() {
    super({ name: 'piston', hardness: 1.5, tool: 'pickaxe', label: 'Piston', pattern: 'piston', color: [140, 120, 95], drops: 'piston' })
  }
}

