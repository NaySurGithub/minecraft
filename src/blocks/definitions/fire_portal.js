import { Block } from '../Block.js'

export default class FirePortalBlock extends Block {
  constructor() {
    super({
      name: 'fire_portal',
      solid: false,
      transparent: true,
      liquid: false,
      light: 10,
      hardness: 0,
      placeable: false,
      label: 'Nether Portal',
      pattern: 'glass',
      color: [145, 60, 220],
      renderType: 'model',
      model: 'portal'
    })
  }
}
