import { Block } from '../Block.js'

export default class OakLeavesBlock extends Block {
  constructor() {
    super({ name: 'oak_leaves', hardness: 0.2, tool: 'shears', label: 'Feuilles de chene', pattern: 'leaves', color: [70, 124, 56], transparent: true, drops: null })
  }
}

