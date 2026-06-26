import { Opaque } from '../Block.js'

export default class SandBlock extends Opaque {
  constructor() {
    super({ name: 'sand', hardness: 0.5, tool: 'shovel', label: 'Sand', pattern: 'noise', color: [219, 205, 154], drops: 'sand', gravity: true })
  }
}

