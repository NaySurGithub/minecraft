import { BlockEvent } from './BlockEvent.js'

export class BlockPlaceEvent extends BlockEvent {
  constructor(block, detail = {}) {
    super('BlockPlaceEvent', block, detail)
  }
}
