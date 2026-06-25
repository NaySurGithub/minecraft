import { BlockEvent } from './BlockEvent.js'

export class BlockBreakStopEvent extends BlockEvent {
  constructor(block, detail = {}) {
    super('BlockBreakStopEvent', block, detail)
  }
}
