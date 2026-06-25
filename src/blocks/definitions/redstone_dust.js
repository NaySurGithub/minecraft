import { Block } from '../Block.js'

export default class RedstoneDust extends Block {
  constructor() {
    super({
      name: 'redstone_dust',
      label: 'Redstone Dust',
      solid: false,
      transparent: true,
      hardness: 0,
      placeable: true,
      pattern: 'cross',
      color: [120, 0, 0],
      renderType: 'model',
      model: 'redstone_dust',
      drops: 'redstone'
    })
  }
}
