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
    this.world = new WorldManager(
      this.config.get('worldName'),
      this.config.get('seed'),
      {
        storage: this.config.get('worldStorage'),
        worldPath: this.config.get('worldPath')
      }
    );
    this.wsHost = new WebSocketHost(this.config.get('port'), this.config.get('bindHost') || '0.0.0.0');
    this.running = false;
    this.tickInterval = null;
    this.nextClientId = 1;
    this.timeOfDay = this.config.get('timeOfDay') || 1000;
    this.weather = this.config.get('weather') || 'clear';
    this.weatherTimer = 0;
    this.difficulty = this.config.get('difficulty') || 'normal';
    this.dimension = 'overworld';
    this.gameMode = this.config.get('gamemode') || 'survival';
    this.pendingClients = new Map();
    this.world.mobState = Array.isArray(this.world.mobState) ? this.world.mobState : [];
    this.world.dropState = Array.isArray(this.world.dropState) ? this.world.dropState : [];
    
    // Cache handlers object to avoid recreating it on every message
    this._handlers = {
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
      [MSG.TOSS]: (client, msg) => this.handleToss(client, msg),
      [MSG.PICKUP_REQUEST]: (client, msg) => this.handlePickupRequest(client, msg)
    };
  }

  start() {
    if (this.running) return;

    console.log('Starting NazzaNayCraft Dedicated Server...');
    console.log(`World: ${this.config.get('worldName')}`);
    console.log(`World Storage: ${this.config.get('worldStorage') || 'folder'}`);
    if (this.config.get('worldPath')) console.log(`World Path: ${this.config.get('worldPath')}`);
    console.log(`Max Players: ${this.config.get('maxPlayers')}`);
    console.log(`Gamemode: ${this.gameMode}`);
    console.log(`Difficulty: ${this.difficulty}`);
    console.log('Public hosting: requires port forwarding or a tunnel (the server already binds to 0.0.0.0).');

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
    const clientId = id;
    const client = {
      id: clientId,
      conn: conn,
      name: 'Player ' + this.nextClientId++,
      key: clientId,
      state: null,
      gamemode: this.gameMode,
      isOp: false,
      _lastInputAt: 0,
      authenticated: false,
      connectedAt: Date.now()
    };
    this.pendingClients.set(clientId, client);
  }

  handleMessage(clientId, msg) {
    const client = this.clients.get(clientId) || this.pendingClients.get(clientId);
    if (!client) return;

    const handler = this._handlers[msg.t];
    if (handler) {
      try {
        handler.call(this, client, msg);
      } catch (error) {
        console.error('Error handling ' + msg.t + ':', error.message);
      }
    } else {
      console.log('Unknown message type: ' + msg.t);
    }
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
      worldName: this.config.get('worldName') || 'world',
      worldStorage: this.config.get('worldStorage') || 'folder'
    });
  }

  handleHello(client, msg) {
    if (!this.clients.has(client.id)) {
      this.pendingClients.delete(client.id);
      this.clients.set(client.id, client);
    }
    client.authenticated = true;
    client.name = msg.name || client.name;
    client.key = msg.clientId || client.key;
    console.log('Client connected: ' + client.id);
    const playerState = this.world.storageAdapter?.loadPlayer ? this.world.storageAdapter.loadPlayer(client.key) : null;

    const spawn = this.world.getSpawnPosition();
    const sendWelcome = (state) => {
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
        playerState: state || null,
        playerKey: client.id
      });
      this.broadcast({
        t: MSG.CHAT,
        name: 'Server',
        text: client.name + ' joined the game'
      });
      console.log(client.name + ' joined the game');
    };

    if (playerState && typeof playerState.then === 'function') {
      playerState.then((state) => sendWelcome(state)).catch(() => sendWelcome(null));
    } else {
      sendWelcome(playerState);
    }
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
    const player = client.state && client.state.player ? client.state.player : null;
    if (!player) return;
    const blockId = this.world.getBlock(msg.x, msg.y, msg.z);
    this.world.setBlock(msg.x, msg.y, msg.z, 0);
    this.broadcast({ t: MSG.BLOCK_UPDATE, x: msg.x, y: msg.y, z: msg.z, id: 0 });
    this.spawnDropFromBlock(msg.x, msg.y, msg.z, blockId);
  }

  handleBreakRay(client, msg) {
    if (!msg.eye || !msg.dir) return;
    const player = client.state && client.state.player ? client.state.player : null;
    if (!player) return;
    const origin = msg.eye || { x: player.x, y: player.y + 1.5, z: player.z };
    const x = Math.floor(origin.x + msg.dir.x * 3);
    const y = Math.floor(origin.y + msg.dir.y * 3);
    const z = Math.floor(origin.z + msg.dir.z * 3);
    const blockId = this.world.getBlock(x, y, z);
    this.world.setBlock(x, y, z, 0);
    this.broadcast({ t: MSG.BLOCK_UPDATE, x, y, z, id: 0 });
    this.spawnDropFromBlock(x, y, z, blockId);
  }

  handlePlace(client, msg) {
    const player = client.state && client.state.player ? client.state.player : null;
    if (!player) return;
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
    } else {
      console.log('Failed to serialize chunk ' + msg.cx + ',' + msg.cz);
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
      } else {
        console.log('Failed to serialize chunk ' + c.cx + ',' + c.cz);
      }
    }
  }

  handleAttackMob(client, msg) {
    const player = client.state && client.state.player ? client.state.player : null;
    if (!player) return;
    this.attackMob(player);
  }

  handleAttackPlayer(client, msg) {
    const player = client.state && client.state.player ? client.state.player : null;
    if (!player) return;
    this.attackPlayer(client.id, player);
  }

  handleGamemodeRequest(client, msg) {
    const mode = msg.mode;
    if (mode === 'survival' || mode === 'creative' || mode === 'spectator') {
      if (this.config.get('opOnlyGamemode') !== false && !client.isOp) {
        client.conn.send({ t: MSG.CHAT, name: 'Server', text: 'Only OP can use /gamemode.' });
        return;
      }
      client.gamemode = mode;
      client.conn.send({ t: MSG.GAMEMODE_SET, mode: mode });
    }
  }

  handlePickupRequest(client, msg) {
    const dropId = msg && msg.dropId
    if (!dropId) return
    const drop = this.world.dropState?.find?.((d) => d && d.id === dropId)
    if (!drop || drop.dead || drop.pickupDelay > 0) return
    const player = client?.state?.player
    if (!player) return
    const dx = drop.x - player.x
    const dy = drop.y - (player.y || 0)
    const dz = drop.z - player.z
    if ((dx * dx + dy * dy + dz * dz) > 1.96) return
    const inv = this.world.storageAdapter?.loadPlayer ? null : null
    const leftover = this._pickupDropIntoInventory(client, drop)
    if (!leftover) return
    this.broadcast({ t: MSG.SNAPSHOT, players: this.serializePlayers(), mobs: this.serializeMobs(), drops: this.serializeDrops() })
  }

  handleToss(client, msg) {
    console.log(client.name + ' tossed item');
  }

  handleDisconnect(clientId) {
    const client = this.clients.get(clientId) || this.pendingClients.get(clientId);
    if (client) {
      if (!client.authenticated) {
        this.pendingClients.delete(clientId);
        return;
      }
      this.savePlayerState(client);
      console.log(client.name + ' left the game');
      this.clients.delete(clientId);
      this.pendingClients.delete(clientId);
      this.broadcast({ t: MSG.PEER_LEFT, id: clientId });
      this.broadcast({ t: MSG.CHAT, name: 'Server', text: client.name + ' left the game' });
    }
  }

  tick() {
    this.tickMobs();
    this.tickDrops();
    // Send snapshot to all clients
    const players = [];
    for (const client of this.clients.values()) {
      if (!client.authenticated) continue;
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
      mobs: this.serializeMobs(),
      drops: this.serializeDrops()
    });

    // Advance time
    this.timeOfDay = (this.timeOfDay + 1) % 24000;
  }

  broadcast(msg, excludeId) {
    const skip = excludeId || null;
    for (const [id, client] of this.clients.entries()) {
      if (!client.authenticated) continue;
      if (skip && id === skip) continue;
      this.wsHost.send(id, msg);
    }
  }

  stop() {
    if (!this.running) return;

    console.log('Stopping server...');
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    for (const client of this.clients.values()) {
      this.savePlayerState(client);
    }
    this.world.saveAll();
    this.wsHost.stop();
    this.pendingClients.clear();
    this.running = false;
    console.log('Server stopped');
  }

  savePlayerState(client) {
    if (!client || !client.authenticated || !this.world?.storageAdapter?.savePlayer) return;
    const payload = {
      name: client.name,
      key: client.key,
      state: client.state || null,
      gamemode: client.gamemode || this.gameMode,
      savedAt: new Date().toISOString()
    };
    try {
      const result = this.world.storageAdapter.savePlayer(client.key || client.id, payload);
      if (result && typeof result.then === 'function') {
        result.catch((e) => console.error('Failed to save player:', e.message));
      }
    } catch (e) {
      console.error('Failed to save player:', e.message);
    }
  }

  spawnDropFromBlock(x, y, z, blockId) {
    if (!blockId) return
    const drop = {
      id: 'drop_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
      x: x + 0.5,
      y: y + 0.25,
      z: z + 0.5,
      blockId,
      count: 1,
      age: 0,
      pickupDelay: 0.8,
      dead: false,
      vx: (Math.random() - 0.5) * 1.5,
      vy: 2 + Math.random() * 0.5,
      vz: (Math.random() - 0.5) * 1.5
    }
    this.world.dropState.push(drop)
  }

  _pickupDropIntoInventory(client, drop) {
    const inventory = client.state?.inventory
    if (!Array.isArray(inventory)) return false
    const slot = inventory.findIndex((s) => !s)
    if (slot < 0) return false
    inventory[slot] = { id: drop.blockId, count: drop.count }
    drop.dead = true
    return true
  }

  tickDrops() {
    const dt = 1 / TICK_RATE
    for (const drop of this.world.dropState || []) {
      if (!drop || drop.dead) continue
      drop.age = (drop.age || 0) + dt
      drop.pickupDelay = Math.max(0, (drop.pickupDelay || 0) - dt)
      drop.vy = (drop.vy || 0) - 18 * dt
      drop.x += (drop.vx || 0) * dt
      drop.y += (drop.vy || 0) * dt
      drop.z += (drop.vz || 0) * dt
    }
    this.world.dropState = (this.world.dropState || []).filter((d) => d && !d.dead && d.age < 300)
  }

  serializePlayers() {
    const players = []
    for (const client of this.clients.values()) {
      if (!client.authenticated || !client.state?.player) continue
      players.push({
        id: client.id,
        name: client.name,
        x: client.state.player.x,
        y: client.state.player.y,
        z: client.state.player.z,
        yaw: client.state.player.yaw,
        pitch: client.state.player.pitch,
        armor: [null, null, null, null]
      })
    }
    return players
  }

  tickMobs() {
    const mobs = this.world.mobState || [];
    for (const mob of mobs) {
      if (!mob || mob.dead) continue;
      mob.age = (mob.age || 0) + 1 / TICK_RATE;
      mob.yaw = typeof mob.yaw === 'number' ? mob.yaw : 0;
      if (mob.state?.angry) {
        mob.yaw += 0.01;
      } else if ((Math.floor(mob.age * 2) % 40) === 0) {
        mob.yaw += (Math.random() - 0.5) * 0.6;
      }
      const speed = mob.type === 'golem' ? 0.05 : 0.03;
      mob.x += Math.sin(mob.yaw) * speed;
      mob.z += Math.cos(mob.yaw) * speed;
    }
    this.world.mobState = mobs;
  }

  serializeDrops() {
    const drops = this.world.dropState || [];
    return drops.filter((d) => d && !d.dead).map((d) => ({
      id: d.id,
      x: d.x,
      y: d.y,
      z: d.z,
      blockId: d.blockId,
      count: d.count,
      age: d.age || 0
    }));
  }

  serializeMobs() {
    const mobs = this.world.mobState || [];
    return mobs.filter((m) => m && !m.dead).map((m) => ({
      id: m.id,
      type: m.type,
      x: m.x,
      y: m.y,
      z: m.z,
      yaw: m.yaw || 0,
      age: m.age || 0,
      state: m.state || null,
      health: m.health == null ? 10 : m.health
    }));
  }

  attackPlayer(attackerId, player) {
    const origin = { x: player.x, y: (player.y || 0) + 1.5, z: player.z }
    const forward = {
      x: -Math.sin(player.yaw || 0) * Math.cos(player.pitch || 0),
      y: Math.sin(player.pitch || 0),
      z: -Math.cos(player.yaw || 0) * Math.cos(player.pitch || 0)
    }
    let best = null
    for (const target of this.getPlayerSnapshots()) {
      if (!target || target.id === attackerId) continue
      const tx = target.x - origin.x
      const ty = ((target.y || 0) + 1.0) - origin.y
      const tz = target.z - origin.z
      const dist = Math.hypot(tx, ty, tz)
      if (dist <= 0.001 || dist > 4.2) continue
      const dot = (tx / dist) * forward.x + (ty / dist) * forward.y + (tz / dist) * forward.z
      if (dot < 0.88) continue
      if (!best || dist < best.dist) best = { target, dist }
    }
    if (!best) return false
    const client = this.clients.get(best.target.id)
    if (!client) return false
    client.conn.send({ t: MSG.HEALTH_SET, id: best.target.id, damage: 3 })
    return true
  }

  attackMob(player) {
    const origin = { x: player.x, y: (player.y || 0) + 1.5, z: player.z }
    const forward = {
      x: -Math.sin(player.yaw || 0) * Math.cos(player.pitch || 0),
      y: Math.sin(player.pitch || 0),
      z: -Math.cos(player.yaw || 0) * Math.cos(player.pitch || 0)
    }
    let best = null
    for (const mob of this.world?.mobManager?.mobs || []) {
      if (!mob || mob.dead || mob.dying) continue
      const tx = mob.position.x - origin.x
      const ty = (mob.position.y + (mob.height || 1) * 0.5) - origin.y
      const tz = mob.position.z - origin.z
      const dist = Math.hypot(tx, ty, tz)
      if (dist <= 0.001 || dist > 4.2) continue
      const dot = (tx / dist) * forward.x + (ty / dist) * forward.y + (tz / dist) * forward.z
      if (dot < 0.88) continue
      if (!best || dist < best.dist) best = { mob, dist }
    }
    if (!best) return false
    best.mob.damage(3, origin.x, origin.z)
    return true
  }

  getPlayerSnapshots() {
    const players = []
    for (const client of this.clients.values()) {
      if (!client?.authenticated || !client?.state?.player) continue
      players.push({
        id: client.id,
        name: client.name,
        x: client.state.player.x,
        y: client.state.player.y,
        z: client.state.player.z,
        yaw: client.state.player.yaw,
        pitch: client.state.player.pitch
      })
    }
    return players
  }
}

module.exports = Server;
