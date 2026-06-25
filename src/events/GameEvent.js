export class GameEvent {
  constructor(type, detail = {}) {
    this.type = type
    this.detail = detail
    this.cancelled = false
  }
  cancel() { this.cancelled = true }
}
