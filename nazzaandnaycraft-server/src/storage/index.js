const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function safeJsonParse(text, fallback = null) {
  try { return JSON.parse(text); } catch (e) { return fallback; }
}

class FolderStorage {
  constructor(options = {}) {
    this.worldPath = options.worldPath || '';
    this.baseDir = this.worldPath ? path.resolve(this.worldPath) : path.resolve('worlds', options.worldName || 'world');
    this.chunksDir = path.join(this.baseDir, 'chunks');
    fs.mkdirSync(this.chunksDir, { recursive: true });
  }

  loadChunk(key) {
    const file = path.join(this.chunksDir, `${key}.json`);
    if (!fs.existsSync(file)) return null;
    return safeJsonParse(fs.readFileSync(file, 'utf8'), null);
  }

  saveChunk(key, data) {
    const file = path.join(this.chunksDir, `${key}.json`);
    fs.writeFileSync(file, JSON.stringify(data));
  }

  saveMeta(meta) {
    fs.writeFileSync(path.join(this.baseDir, 'world.json'), JSON.stringify(meta, null, 2));
  }

  loadMeta() {
    const file = path.join(this.baseDir, 'world.json');
    if (!fs.existsSync(file)) return null;
    return safeJsonParse(fs.readFileSync(file, 'utf8'), null);
  }

  loadPlayer(playerId) {
    const file = path.join(this.baseDir, 'players', `${playerId}.dat`);
    if (!fs.existsSync(file)) return null;
    return safeJsonParse(fs.readFileSync(file, 'utf8'), null);
  }

  savePlayer(playerId, data) {
    const dir = path.join(this.baseDir, 'players');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${playerId}.dat`), JSON.stringify(data, null, 2));
  }
}

class SqliteStorage {
  constructor(options = {}) {
    const Database = require('better-sqlite3');
    this.dbPath = path.resolve(options.worldPath || path.join('worlds', options.worldName || 'world', 'world.sqlite'));
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
    `);
    this.upsertChunk = this.db.prepare('INSERT INTO chunks(key, data) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET data=excluded.data');
    this.getChunk = this.db.prepare('SELECT data FROM chunks WHERE key = ?');
    this.upsertMeta = this.db.prepare('INSERT INTO meta(key, data) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET data=excluded.data');
  }

  loadChunk(key) {
    const row = this.getChunk.get(key);
    return row ? safeJsonParse(row.data, null) : null;
  }

  saveChunk(key, data) {
    this.upsertChunk.run(key, JSON.stringify(data));
  }

  saveMeta(meta) {
    this.upsertMeta.run('world', JSON.stringify(meta));
  }

  loadMeta() {
    const row = this.db.prepare('SELECT data FROM meta WHERE key = ?').get('world');
    return row ? safeJsonParse(row.data, null) : null;
  }

  loadPlayer(playerId) {
    const row = this.db.prepare('SELECT data FROM meta WHERE key = ?').get(`player:${playerId}`);
    return row ? safeJsonParse(row.data, null) : null;
  }

  savePlayer(playerId, data) {
    this.upsertMeta.run(`player:${playerId}`, JSON.stringify(data));
  }
}

class MongoStorage {
  constructor(options = {}) {
    this.mode = options.storageMode || 'mongodb';
    this.uri = options.mongoUri || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
    this.dbName = options.mongoDbName || 'nazzaandnaycraft';
    this.worldName = options.worldName || 'world';
    this.packageName = this.mode === 'mongoose' ? 'mongoose' : 'mongodb';
  }

  runScript(payload) {
    const script = `
      const payload = JSON.parse(process.argv[1]);
      (async () => {
        const mode = payload.mode;
        if (mode === 'mongoose') {
          const mongoose = require('mongoose');
          await mongoose.connect(payload.uri, { dbName: payload.dbName });
          const schema = new mongoose.Schema({ worldName: String, key: String, data: Object, updatedAt: Date }, { strict: false });
          const Chunk = mongoose.models.Chunk || mongoose.model('Chunk', schema);
          const Meta = mongoose.models.Meta || mongoose.model('Meta', schema);
          if (payload.op === 'loadChunk') {
            const row = await Chunk.findOne({ worldName: payload.worldName, key: payload.key }).lean();
            console.log(JSON.stringify(row ? row.data : null));
          } else if (payload.op === 'saveChunk') {
            await Chunk.updateOne({ worldName: payload.worldName, key: payload.key }, { $set: { worldName: payload.worldName, key: payload.key, data: payload.data, updatedAt: new Date() } }, { upsert: true });
            console.log('null');
          } else if (payload.op === 'saveMeta') {
            await Meta.updateOne({ worldName: payload.worldName, key: 'world' }, { $set: { worldName: payload.worldName, key: 'world', data: payload.data, updatedAt: new Date() } }, { upsert: true });
            console.log('null');
          }
          await mongoose.disconnect();
        } else {
          const { MongoClient } = require('mongodb');
          const client = new MongoClient(payload.uri);
          await client.connect();
          const db = client.db(payload.dbName);
          const chunks = db.collection('chunks');
          const meta = db.collection('meta');
          if (payload.op === 'loadChunk') {
            const row = await chunks.findOne({ worldName: payload.worldName, key: payload.key });
            console.log(JSON.stringify(row ? row.data : null));
          } else if (payload.op === 'loadMeta') {
            const row = await meta.findOne({ worldName: payload.worldName, key: 'world' });
            console.log(JSON.stringify(row ? row.data : null));
          } else if (payload.op === 'saveChunk') {
            await chunks.updateOne({ worldName: payload.worldName, key: payload.key }, { $set: { worldName: payload.worldName, key: payload.key, data: payload.data, updatedAt: new Date() } }, { upsert: true });
            console.log('null');
          } else if (payload.op === 'loadPlayer') {
            const row = await meta.findOne({ worldName: payload.worldName, key: 'player:' + payload.playerId });
            console.log(JSON.stringify(row ? row.data : null));
          } else if (payload.op === 'savePlayer') {
            await meta.updateOne({ worldName: payload.worldName, key: 'player:' + payload.playerId }, { $set: { worldName: payload.worldName, key: 'player:' + payload.playerId, data: payload.data, updatedAt: new Date() } }, { upsert: true });
            console.log('null');
          } else if (payload.op === 'saveMeta') {
            await meta.updateOne({ worldName: payload.worldName, key: 'world' }, { $set: { worldName: payload.worldName, key: 'world', data: payload.data, updatedAt: new Date() } }, { upsert: true });
            console.log('null');
          }
          await client.close();
        }
      })().catch((err) => { console.error(err); process.exit(1); });
    `;
    return execFileSync(process.execPath, ['-e', script, JSON.stringify({ ...payload, mode: this.mode })], { encoding: 'utf8' });
  }

  loadChunk(key) {
    const out = this.runScript({ op: 'loadChunk', uri: this.uri, dbName: this.dbName, worldName: this.worldName, key });
    return safeJsonParse(out.trim() || 'null', null);
  }

  saveChunk(key, data) {
    this.runScript({ op: 'saveChunk', uri: this.uri, dbName: this.dbName, worldName: this.worldName, key, data });
  }

  saveMeta(meta) {
    this.runScript({ op: 'saveMeta', uri: this.uri, dbName: this.dbName, worldName: this.worldName, data: meta });
  }

  loadPlayer(playerId) {
    const out = this.runScript({ op: 'loadPlayer', uri: this.uri, dbName: this.dbName, worldName: this.worldName, playerId });
    return safeJsonParse(out.trim() || 'null', null);
  }

  loadMeta() {
    const out = this.runScript({ op: 'loadMeta', uri: this.uri, dbName: this.dbName, worldName: this.worldName });
    return safeJsonParse(out.trim() || 'null', null);
  }

  savePlayer(playerId, data) {
    this.runScript({ op: 'savePlayer', uri: this.uri, dbName: this.dbName, worldName: this.worldName, playerId, data });
  }
}

function createWorldStorage(options = {}) {
  const mode = String(options.storage || 'folder').toLowerCase();
  if (mode === 'sqlite') return new SqliteStorage(options);
  if (mode === 'mongodb' || mode === 'mongoose') return new MongoStorage({ ...options, storageMode: mode });
  return new FolderStorage(options);
}

module.exports = { createWorldStorage, FolderStorage, SqliteStorage, MongoStorage };
