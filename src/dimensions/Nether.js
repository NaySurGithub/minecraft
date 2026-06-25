import { Dimension } from './Dimension.js'

export class Nether extends Dimension {
  constructor() {
    super('nether', {
      scale: 8,
      skyColor: 0x2a0d14,
      fogColor: 0x3c1016,
      ambient: 0.18,
      sun: 0.35
    })
  }
}
