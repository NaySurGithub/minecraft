import { Opaque } from '../Block.js'

export default class WoolBlock extends Opaque {
  constructor() {
    super({ name: 'wool', hardness: 0.8, tool: 'shears', label: 'Wool', pattern: 'wool', color: [236, 236, 236], drops: 'wool' })
  }
}
