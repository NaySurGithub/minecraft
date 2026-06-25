import { Opaque } from '../Block.js'

export default class RedstoneLamp extends Opaque {
  constructor() {
    super({
      name: 'redstone_lamp',
      label: 'Redstone Lamp',
      hardness: 0.3,
      tool: null,
      color: [95, 65, 35],
      pattern: 'solid',
      light: 0,
      drops: 'redstone_lamp'
    })
  }
}
