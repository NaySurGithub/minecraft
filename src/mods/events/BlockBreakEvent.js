import { BlockEvent } from './BlockEvent.js'

export class BlockBreakEvent extends BlockEvent {
  constructor(block, detail = {}) {
    super('BlockBreakEvent', block, detail)
  }
}
