import { Opaque } from '../Block.js'

export default class RedstoneLampLit extends Opaque {
  constructor() {
    super({
      name: 'redstone_lamp_lit',
      label: 'Redstone Lamp (Lit)',
      hardness: 0.3,
      tool: null,
      color: [250, 220, 140],
      pattern: 'solid',
      light: 15,
      placeable: false,
      drops: 'redstone_lamp'
    })
  }
}
