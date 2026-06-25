export class Packet {
  constructor(type, data = {}) {
    this.type = type
    this.data = data
  }
}
