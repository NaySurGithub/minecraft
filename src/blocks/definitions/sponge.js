import { Opaque } from '../Block.js'

export default class SpongeBlock extends Opaque {
  constructor() {
    super({ name: 'sponge', hardness: 0.6, tool: 'pickaxe', label: 'Sponge', pattern: 'noise', color: [202, 186, 94], drops: 'sponge' })
  }
}
