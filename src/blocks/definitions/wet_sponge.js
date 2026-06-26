import { Opaque } from '../Block.js'

export default class WetSpongeBlock extends Opaque {
  constructor() {
    super({ name: 'wet_sponge', hardness: 0.6, tool: 'pickaxe', label: 'Wet Sponge', pattern: 'noise', color: [118, 146, 94], drops: 'wet_sponge' })
  }
}
