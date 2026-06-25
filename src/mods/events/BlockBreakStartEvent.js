import { BlockEvent } from './BlockEvent.js'

export class BlockBreakStartEvent extends BlockEvent {
  constructor(block, detail = {}) {
    super('BlockBreakStartEvent', block, detail)
  }
}
