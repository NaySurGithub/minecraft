const fs = require('fs');
const path = require('path');
const { MSG, encodeVoxels, encodeBytes } = require('../net/protocol');

const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 128;

/**
 * Manages world state for the dedicated server.
 * Generates terrain, stores chunks, and handles block changes.
 */
class WorldManager {
  constructor(worldName, seed = null) {
    this.worldName = worldName;
    this.seed = seed || Math.floor(Math.random() * 2147483647);
    this.worldDir = path.resolve('worlds', worldName);
    this.chunks = new Map(); // key "cx,cz" -> { voxels: Uint16Array, levels: Uint8Array, edits: Map }
    this.ensureWorldDir();
  }

  ensureWorldDir() {
    if (!fs.existsSync(this.worldDir)) {
      fs.mkdirSync(this.worldDir, { recursive: true });
    }
    const chunksDir = path.join(this.worldDir, 'chunks');
    if (!fs.existsSync(chunksDir)) {
      fs.mkdirSync(chunksDir, { recursive: true });
    }
  }

  getChunkKey(cx, cz) {
    return `${cx},${cz}`;
  }

  /**
   * Get or generate a chunk.
   */
  getChunk(cx, cz) {
    const key = this.getChunkKey(cx, cz);
    if (this.chunks.has(key)) {
      return this.chunks.get(key);
    }
    return this.loadOrGenerateChunk(cx, cz);
  }

  /**
   * Load chunk from disk or generate it.
   */
  loadOrGenerateChunk(cx, cz) {
    const key = this.getChunkKey(cx, cz);
    const chunkFile = path.join(this.worldDir, 'chunks', `${key}.json`);

    let chunk;
    if (fs.existsSync(chunkFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(chunkFile, 'utf8'));
        chunk = {
          cx,
          cz,
          voxels: new Uint16Array(data.voxels),
          levels: new Uint8Array(data.levels || new Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT).fill(0)),
          edits: new Map(data.edits || [])
        };
      } catch (e) {
        console.error(`Failed to load chunk ${key}:`, e.message);
        chunk = this.generateChunk(cx, cz);
      }
    } else {
      chunk = this.generateChunk(cx, cz);
    }

    this.chunks.set(key, chunk);
    return chunk;
  }

  /**
   * Generate a new chunk with terrain.
   */
  generateChunk(cx, cz) {
    const voxels = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
    const levels = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const worldX = cx * CHUNK_SIZE + x;
        const worldZ = cz * CHUNK_SIZE + z;
        const height = this.getTerrainHeight(worldX, worldZ);

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          const index = y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x;
          
          if (y === 0) {
            // Bedrock
            voxels[index] = 7; // bedrock
          } else if (y < height - 4) {
            // Stone
            voxels[index] = 1; // stone
          } else if (y < height - 1) {
            // Dirt
            voxels[index] = 3; // dirt
          } else if (y === height - 1) {
            // Grass
            voxels[index] = 2; // grass
          } else if (y < 48) {
            // Water level
            voxels[index] = 0; // air above terrain but below sea level is water
            // Actually let's put water
            if (y < 48 && y >= height) {
              voxels[index] = 41; // water (need to check actual ID)
            }
          } else {
            // Air
            voxels[index] = 0; // air
          }
        }
      }
    }

    return {
      cx,
      cz,
      voxels,
      levels,
      edits: new Map()
    };
  }

  /**
   * Simple terrain height using sine waves.
   */
  getTerrainHeight(x, z) {
    const scale = 0.05;
    const height = Math.floor(
      40 +
      Math.sin(x * scale) * 8 +
      Math.cos(z * scale) * 8 +
      Math.sin((x + z) * scale * 0.5) * 4
    );
    return Math.max(1, Math.min(CHUNK_HEIGHT - 1, height));
  }

  /**
   * Set a block in the world.
   */
  setBlock(wx, wy, wz, blockId) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return false;
    
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    const chunk = this.getChunk(cx, cz);
    if (!chunk) return false;

    const index = wy * CHUNK_SIZE * CHUNK_SIZE + lz * CHUNK_SIZE + lx;
    if (index >= 0 && index < chunk.voxels.length) {
      chunk.voxels[index] = blockId;
      chunk.edits.set(index, blockId);
      return true;
    }
    return false;
  }

  /**
   * Get a block from the world.
   */
  getBlock(wx, wy, wz) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return 0;
    
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    const chunk = this.getChunk(cx, cz);
    if (!chunk) return 0;

    const index = wy * CHUNK_SIZE * CHUNK_SIZE + lz * CHUNK_SIZE + lx;
    if (index >= 0 && index < chunk.voxels.length) {
      return chunk.voxels[index];
    }
    return 0;
  }

  /**
   * Serialize chunk data for sending to client.
   * Returns { cx, cz, voxels: base64, levels: base64 }
   */
  serializeChunkData(cx, cz) {
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return null;

    return {
      cx,
      cz,
      voxels: encodeVoxels(chunk.voxels),
      levels: encodeBytes(chunk.levels)
    };
  }

  /**
   * Save a chunk to disk.
   */
  saveChunk(cx, cz) {
    const key = this.getChunkKey(cx, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return;

    const chunkFile = path.join(this.worldDir, 'chunks', `${key}.json`);
    const data = {
      cx: chunk.cx,
      cz: chunk.cz,
      voxels: Array.from(chunk.voxels),
      levels: Array.from(chunk.levels),
      edits: Array.from(chunk.edits.entries())
    };
    fs.writeFileSync(chunkFile, JSON.stringify(data));
  }

  /**
   * Save all loaded chunks.
   */
  saveAll() {
    for (const [key] of this.chunks) {
      const [cx, cz] = key.split(',').map(Number);
      this.saveChunk(cx, cz);
    }
    console.log(`Saved ${this.chunks.size} chunks`);
  }

  /**
   * Get spawn position (top of terrain at 0,0).
   */
  getSpawnPosition() {
    const height = this.getTerrainHeight(0, 0);
    return { x: 0.5, y: height + 1, z: 0.5, yaw: 0, pitch: 0 };
  }
}

module.exports = WorldManager;
