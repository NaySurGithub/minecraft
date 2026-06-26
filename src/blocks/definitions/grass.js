import { Opaque } from '../Block.js'

export default class GrassBlock extends Opaque {
  constructor() {
    super({ name: 'grass', hardness: 0.6, tool: 'shovel', label: 'Grass', pattern: 'grass', color: [96, 160, 72], drops: 'dirt', faces: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' } })
  }
}

