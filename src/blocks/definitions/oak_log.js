import { Opaque } from '../Block.js'

export default class OakLogBlock extends Opaque {
  constructor() {
    super({ name: 'oak_log', hardness: 1.2, tool: 'axe', label: 'Oak Log', pattern: 'log', color: [108, 84, 52], drops: 'oak_log', faces: { top: 'log_top', bottom: 'log_top', side: 'log_side' } })
  }
}

