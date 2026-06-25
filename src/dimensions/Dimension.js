export class Dimension {
  constructor(name, options = {}) {
    this.name = name
    this.scale = options.scale || 1
    this.skyColor = options.skyColor || 0x87ceeb
    this.fogColor = options.fogColor || 0x87ceeb
    this.ambient = options.ambient || 1
    this.sun = options.sun || 1
  }
}
