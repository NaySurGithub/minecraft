import { Opaque } from '../Block.js'

export default class OakPlanksBlock extends Opaque {
  constructor() {
    super({ name: 'oak_planks', hardness: 1.2, tool: 'axe', label: 'Oak Planks', pattern: 'planks', color: [160, 128, 78] })
  }
}

