const WebSocketHost = require('./net/websocket');
const WorldManager = require('./world/manager');
const Config = require('./config');
const { MSG, PROTOCOL_VERSION } = require('./net/protocol');
const os = require('os');

const TICK_RATE = 20; // ticks per second
const INPUT_RATE_LIMIT_MS = 40; // ~25/sec

class Server {
  constructor(configPath) {
    this.config = new Config(configPath);
    this.clients = new Map(); // clientId -> client object
    this.world = new WorldManager(this.config.get('worldName'), this.config.get('seed'));
    this.wsHost = new WebSocketHost(this.config.get('port'));
    this.running = false;
    this.tickInterval = null;
    this.nextClientId = 1;
    this.timeOfDay = this.config.get('timeOfDay') || 1000;
    this.weather = this.config.get('weather') || 'clear';
    this.weatherTimer = 0;
    this.difficulty = this.config.get('difficulty') || 'normal';
    this.dimension = 'overworld';
    this.gameMode = this.config.get('gamemode') || 'survival';
  }

  start() {
    if (this.running) return;

    console.log('Starting NazzaNayCraft Dedicated Server...');
    console.log(`World: ${this.config.get('worldName')}`);
    console.log(`Max Players: ${this.config.get('maxPlayers')}`);
    console.log(`Gamemode: ${this.gameMode}`);
    console.log(`Difficulty: ${this.difficulty}`);

    this.wsHost.start(
      (id, conn) => this.handleConnection(id, conn),
      (id, msg) => this.handleMessage(id, msg),
      (id) => this.handleDisconnect(id)
    );

    // Start game tick
    this.tickInterval = setInterval(() => this.tick(), 1000 / TICK_RATE);

    this.running = true;

    // Display IP addresses
    const port = this.config.get('port');
    console.log('');
    console.log('--- Server Started ---');
    console.log('Listening on port ' + port);
    const addresses = this.getLocalAddresses();
    if (addresses.length > 0) {
      console.log('Connect via:');
      for (const addr of addresses) {
        console.log('  ' + addr + ':' + port);
      }
    } else {
      console.log('  localhost:' + port);
    }
    console.log('----------------------');
    console.log('');
    console.log('Type /help for available commands');
  }

  getLocalAddresses() {
    const addresses = [];
    try {
      const interfaces = os.networkInterfaces();
      for (const [name, nets] of Object.entries(interfaces)) {
        for (const net of nets) {
          if (net.family === 'IPv4' && !net.internal) {
            addresses.push(net.address);
          }
        }
      }
    } catch (e) {
      // fallback
    }
    // Always include localhost
    if (!addresses.includes('127.0.0.1')) {
      addresses.unshift('127.0.0.1');
    }
    return addresses;
  }

  handleConnection(id, conn) {
    const clientId = 'client_' + (this.nextClientId++);
    const client = {
      id: clientId,
      conn: conn,
      name: 'Player ' + this.nextClientId,
      key: clientId,
      state: null,
      gamemode: this.gameMode,
      isOp: false,
      _lastInputAt: 0
    };
    this.clients.set(clientId, client);
    console.log('Client connected: ' + clientId);
  }

  handleMessage(clientId, msg) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const handler = this.handlers[msg.t];
    if (handler) {
      try {
        handler.call(this, client, msg);
      } catch (error) {
        console.error('Error handling ' + msg.t + ':', error.message);
      }
    }
  }

  get handlers() {
    return {
      [MSG.STATUS]: (client, msg) => this.handleStatus(client, msg),
      [MSG.HELLO]: (client, msg) => this.handleHello(client, msg),
      [MSG.INPUT]: (client, msg) => this.handleInput(client, msg),
      [MSG.BREAK_BLOCK]: (client, msg) => this.handleBreakBlock(client, msg),
      [MSG.BREAK_RAY]: (client, msg) => this.handleBreakRay(client, msg),
      [MSG.PLACE]: (client, msg) => this.handlePlace(client, msg),
      [MSG.CHAT]: (client, msg) => this.handleChat(client, msg),
      [MSG.COMMAND]: (client, msg) => this.handleCommand(client, msg),
      [MSG.CHUNK_REQUEST]: (client, msg) => this.handleChunkRequest(client, msg),
      [MSG.CHUNK_VISIBILITY]: (client, msg) => this.handleChunkVisibility(client, msg),
      [MSG.ATTACK_MOB]: (client, msg) => this.handleAttackMob(client, msg),
      [MSG.ATTACK_PLAYER]: (client, msg) => this.handleAttackPlayer(client, msg),
      [MSG.GAMEMODE_REQUEST]: (client, msg) => this.handleGamemodeRequest(client, msg),
      [MSG.TOSS]: (client, msg) => this.handleToss(client, msg)
    };
  }

  handleStatus(client, msg) {
    // Lightweight status response for server browser pings.
    // Does NOT require a full HELLO handshake.
    const playerCount = this.clients.size;
    const maxPlayers = this.config.get('maxPlayers') || 20;
    client.conn.send({
      t: MSG.STATUS_RESPONSE,
      version: PROTOCOL_VERSION,
      motd: this.config.get('motd') || 'A NazzaNayCraft Server',
      players: playerCount,
      maxPlayers: maxPlayers,
      gameMode: this.gameMode,
      difficulty: this.difficulty,
      dimension: this.dimension,
      worldName: this.config.get('worldName') || 'world'
    });
  }

  handleHello(client, msg) {
    client.name = msg.name || client.name;
    client.key = msg.clientId || client.key;

    const spawn = this.world.getSpawnPosition();
    
    // Send welcome packet
    client.conn.send({
      t: MSG.WELCOME,
      version: PROTOCOL_VERSION,
      id: client.id,
      seed: this.world.seed,
      gameMode: this.gameMode,
      mods: [],
      timeOfDay: this.timeOfDay,
      weather: this.weather,
      weatherTimer: this.weatherTimer,
      difficulty: this.difficulty,
      dimension: this.dimension,
      spawn: spawn,
      playerState: null,
      playerKey: client.id
    });

    // Notify other clients
    this.broadcast({
      t: MSG.CHAT,
      name: 'Server',
      text: client.name + ' joined the game'
    });

    console.log(client.name + ' joined the game');
  }

  handleInput(client, msg) {
    const now = Date.now();
    if (now - client._lastInputAt < INPUT_RATE_LIMIT_MS) return;
    client._lastInputAt = now;

    const state = msg.state;
    if (!state) return;

    client.state = {
      player: state.player || null,
      input: state.input || null,
      inventory: state.inventory || null,
      health: state.health || null
    };
  }

  handleBreakBlock(client, msg) {
    this.world.setBlock(msg.x, msg.y, msg.z, 0);
    this.broadcast({ t: MSG.BLOCK_UPDATE, x: msg.x, y: msg.y, z: msg.z, id: 0 });
  }

  handleBreakRay(client, msg) {
    // Simplified: just break the block at the ray endpoint
    if (msg.eye && msg.dir) {
      const player = client.state && client.state.player ? client.state.player : null;
      if (player) {
        const x = Math.floor(player.x + msg.dir.x * 3);
        const y = Math.floor(player.y + msg.dir.y * 3);
        const z = Math.floor(player.z + msg.dir.z * 3);
        this.world.setBlock(x, y, z, 0);
        this.broadcast({ t: MSG.BLOCK_UPDATE, x: x, y: y, z: z, id: 0 });
      }
    }
  }

  handlePlace(client, msg) {
    this.world.setBlock(msg.x, msg.y, msg.z, msg.id);
    this.broadcast({ t: MSG.BLOCK_UPDATE, x: msg.x, y: msg.y, z: msg.z, id: msg.id });
  }

  handleChat(client, msg) {
    const text = String(msg.text || '').slice(0, 180);
    this.broadcast({ t: MSG.CHAT, name: client.name, text: text });
    console.log('<' + client.name + '> ' + text);
  }

  handleCommand(client, msg) {
    const text = String(msg.text || '').trim();
    if (!text) return;

    // Simple command handling
    if (text.startsWith('/')) {
      const parts = text.slice(1).split(' ');
      const cmd = parts[0];
      const args = parts.slice(1);

      switch (cmd) {
        case 'help':
          client.conn.send({ t: MSG.CHAT, name: 'Server', text: 'Commands: /help, /list, /gamemode, /time, /weather' });
          break;
        case 'list':
          var players = Array.from(this.clients.values()).map(function(c) { return c.name; }).join(', ');
          client.conn.send({ t: MSG.CHAT, name: 'Server', text: 'Players: ' + players });
          break;
        case 'gamemode':
          if (args[0]) {
            this.gameMode = args[0];
            this.broadcast({ t: MSG.GAMEMODE_SET, mode: args[0] });
            client.conn.send({ t: MSG.CHAT, name: 'Server', text: 'Gamemode set to ' + args[0] });
          }
          break;
        case 'time':
          if (args[0]) {
            this.timeOfDay = parseInt(args[0]) || 0;
            client.conn.send({ t: MSG.CHAT, name: 'Server', text: 'Time set to ' + this.timeOfDay });
          }
          break;
        case 'weather':
          if (args[0]) {
            this.weather = args[0];
            this.broadcast({ t: MSG.SNAPSHOT, weather: this.weather, weatherTimer: 0 });
            client.conn.send({ t: MSG.CHAT, name: 'Server', text: 'Weather set to ' + this.weather });
          }
          break;
        default:
          client.conn.send({ t: MSG.CHAT, name: 'Server', text: 'Unknown command: ' + cmd });
      }
    }
  }

  handleChunkRequest(client, msg) {
    const data = this.world.serializeChunkData(msg.cx, msg.cz);
    if (data) {
      client.conn.send({ t: MSG.CHUNK_DATA, cx: data.cx, cz: data.cz, voxels: data.voxels, levels: data.levels });
    }
  }

  handleChunkVisibility(client, msg) {
    const chunks = Array.isArray(msg.chunks) ? msg.chunks : [];
    for (var i = 0; i < chunks.length; i++) {
      var c = chunks[i];
      if (!c) continue;
      const data = this.world.serializeChunkData(c.cx, c.cz);
      if (data) {
        client.conn.send({ t: MSG.CHUNK_DATA, cx: data.cx, cz: data.cz, voxels: data.voxels, levels: data.levels });
      }
    }
  }

  handleAttackMob(client, msg) {
    console.log(client.name + ' attacked a mob');
  }

  handleAttackPlayer(client, msg) {
    console.log(client.name + ' attacked a player');
  }

  handleGamemodeRequest(client, msg) {
    const mode = msg.mode;
    if (mode === 'survival' || mode === 'creative' || mode === 'spectator') {
      client.gamemode = mode;
      client.conn.send({ t: MSG.GAMEMODE_SET, mode: mode });
    }
  }

  handleToss(client, msg) {
    console.log(client.name + ' tossed item');
  }

  handleDisconnect(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      console.log(client.name + ' left the game');
      this.clients.delete(clientId);
      this.broadcast({ t: MSG.PEER_LEFT, id: clientId });
      this.broadcast({ t: MSG.CHAT, name: 'Server', text: client.name + ' left the game' });
    }
  }

  tick() {
    // Send snapshot to all clients
    const players = [];
    for (const client of this.clients.values()) {
      if (client.state && client.state.player) {
        players.push({
          id: client.id,
          name: client.name,
          x: client.state.player.x,
          y: client.state.player.y,
          z: client.state.player.z,
          yaw: client.state.player.yaw,
          pitch: client.state.player.pitch,
          armor: [null, null, null, null]
        });
      }
    }

    this.broadcast({
      t: MSG.SNAPSHOT,
      timeOfDay: this.timeOfDay,
      weather: this.weather,
      weatherTimer: this.weatherTimer,
      difficulty: this.difficulty,
      dimension: this.dimension,
      players: players,
      mobs: [],
      drops: []
    });

    // Advance time
    this.timeOfDay = (this.timeOfDay + 1) % 24000;
  }

  broadcast(msg, excludeId) {
    this.wsHost.broadcast(msg, excludeId || null);
  }

  stop() {
    if (!this.running) return;

    console.log('Stopping server...');
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.world.saveAll();
    this.wsHost.stop();
    this.running = false;
    console.log('Server stopped');
  }
}

module.exports = Server;
