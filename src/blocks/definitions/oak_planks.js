import { Opaque } from '../Block.js'

export default class OakPlanksBlock extends Opaque {
  constructor() {
    super({ name: 'oak_planks', hardness: 1.2, tool: 'axe', label: 'Planches de chene', pattern: 'planks', color: [160, 128, 78] })
  }
}

