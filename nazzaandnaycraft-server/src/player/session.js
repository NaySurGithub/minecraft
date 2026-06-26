const { v4: uuidv4 } = require('uuid');

class PlayerSession {
  constructor(id, ws, username) {
    this.id = id;
    this.uuid = uuidv4();
    this.ws = ws;
    this.username = username;
    this.position = { x: 0, y: 64, z: 0 };
    this.rotation = { yaw: 0, pitch: 0 };
    this.health = 20;
    this.gamemode = 'survival';
    this.inventory = [];
    this.connected = true;
    this.lastPing = Date.now();
  }

  updatePosition(x, y, z) {
    this.position = { x, y, z };
  }

  updateRotation(yaw, pitch) {
    this.rotation = { yaw, pitch };
  }

  setPosition(pos) {
    this.position = { ...pos };
  }

  toData() {
    return {
      id: this.id,
      uuid: this.uuid,
      username: this.username,
      position: this.position,
      rotation: this.rotation,
      health: this.health,
      gamemode: this.gamemode
    };
  }

  disconnect() {
    this.connected = false;
  }
}

module.exports = PlayerSession;
