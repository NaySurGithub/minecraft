const fs = require('fs');
const path = require('path');

class Config {
  constructor(configPath = 'server.json') {
    this.path = path.resolve(configPath);
    this.data = this.load();
  }

  load() {
    if (fs.existsSync(this.path)) {
      return JSON.parse(fs.readFileSync(this.path, 'utf8'));
    }
    return this.defaults();
  }

  defaults() {
    return {
      port: 25565,
      maxPlayers: 20,
      worldName: 'world',
      gamemode: 'survival',
      difficulty: 'normal',
      pvp: true,
      whitelist: false,
      motd: 'A NazzaNayCraft Server',
      spawnProtection: 16,
      viewDistance: 10
    };
  }

  save() {
    fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2));
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
  }
}

module.exports = Config;
