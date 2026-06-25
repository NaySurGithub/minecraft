import { Opaque } from '../Block.js'

export default class CraftingTableBlock extends Opaque {
  constructor() {
    super({ name: 'crafting_table', hardness: 2.5, tool: 'axe', label: 'Etabli', pattern: 'planks', color: [160, 128, 78], drops: 'crafting_table', faces: { top: 'crafting_top', bottom: 'oak_planks', side: 'crafting_side' } })
  }
}

