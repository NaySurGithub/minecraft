import { Block } from '../Block.js'

export default class LavaBlock extends Block {
  constructor() {
    super({ name: 'lava', solid: false, liquid: true, transparent: true, light: 15, hardness: -1, tool: null, label: 'Lave', pattern: 'lava', color: [235, 110, 20], placeable: false, drops: null })
  }
}
