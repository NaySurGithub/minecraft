import { Block } from '../Block.js'

export default class WaterBlock extends Block {
  constructor() {
    super({ name: 'water', solid: false, liquid: true, transparent: true, hardness: -1, tool: null, label: 'Eau', pattern: 'water', color: [60, 110, 200], placeable: false, drops: null })
  }
}

