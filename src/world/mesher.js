import * as THREE from 'three'
import { CHUNK_SIZE, CHUNK_HEIGHT } from '../config/constants.js'
import { blocks, AIR, blockIds } from '../blocks/registry.js'
import { FACES } from './meshFaces.js'
import { DEBUG_TEXTURES, debugLog, debugOnce, blockName } from '../debug/debug.js'
import { getSkyLightFast, getBlockLightAtChunk } from './lightEngine.js'
import { daylightFactor } from './dayNightCycle.js'

function isOpaque(id) {
  if (id === AIR) return false
  const b = blocks[id]
  if (!b) return false
  if (b.renderType === 'model') return false
  return b.solid && !b.transparent
}

function shouldRenderFace(self, neighbor) {
  if (neighbor === AIR) return true
  const nb = blocks[neighbor]
  if (!nb) return true
  if (nb.renderType === 'model') return true
  if (nb.transparent || !nb.solid) return self !== neighbor
  return false
}

function weatherSkyMultiplier(world) {
  const weather = world?.weather || 'clear'
  if (weather === 'storm' || weather === 'thunder') return 0.45
  if (weather === 'rain') return 0.7
  return 1
}

function faceTilesFor(atlas, blockId, uvKind) {
  const tiles = atlas.faceTiles(blockId)
  if (!tiles) return 0
  if (uvKind === 'top') return tiles.top
  if (uvKind === 'bottom') return tiles.bottom
  return tiles.side
}

function buildGeometry(positions, normals, colors, uvs, indices) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}

function buildChunkLightBuffer(chunk, world) {
  const buffer = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT)
  if (world?.nightVisionActive) {
    buffer.fill(15)
    return buffer
  }
  const skyMap = chunk.skyMap
  const blockMap = chunk.lightMap
  const skyMax = world?.dimension === 'nether'
    ? 0
    : Math.round((4 + daylightFactor(world?.timeOfDay || 0) * 11) * weatherSkyMultiplier(world))

  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const top = skyMap ? skyMap[z * CHUNK_SIZE + x] : 255
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        const idx = y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x
        // Sky light: full if this column is open above this Y (direct sky).
        // Note: this buffer stores the light AT each position for the current
        // block's column. Face lighting in meshChunk reads the NEIGHBOR's
        // column, so side faces automatically get the correct open-sky value.
        const sky = top === 255 || y > top ? skyMax : 0
        const block = blockMap ? getBlockLightAtChunk(chunk, x, y, z) : 0
        buffer[idx] = Math.max(sky, block)
      }
    }
  }
  return buffer
}

export function meshChunk(chunk, atlas, neighbors, world = null) {
  const opaque = { positions: [], normals: [], colors: [], uvs: [], indices: [] }
  const transparent = { positions: [], normals: [], colors: [], uvs: [], indices: [] }
  const debugCounts = DEBUG_TEXTURES ? new Map() : null
  const debugFaces = DEBUG_TEXTURES ? [] : null
  const lightBuffer = world ? buildChunkLightBuffer(chunk, world) : null

  const get = (x, y, z) => {
    if (y < 0 || y >= CHUNK_HEIGHT) return AIR
    if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
      return chunk.get(x, y, z)
    }
    let nx = x, nz = z, n = null
    if (x < 0) { n = neighbors.xneg; nx = x + CHUNK_SIZE }
    else if (x >= CHUNK_SIZE) { n = neighbors.xpos; nx = x - CHUNK_SIZE }
    else if (z < 0) { n = neighbors.zneg; nz = z + CHUNK_SIZE }
    else if (z >= CHUNK_SIZE) { n = neighbors.zpos; nz = z - CHUNK_SIZE }
    if (!n) return AIR
    return n.get(nx, y, nz)
  }

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const id = chunk.get(x, y, z)
        if (id === AIR) continue
        const block = blocks[id]
        if (!block) continue
        if (block.renderType === 'model') continue
        if (debugCounts) debugCounts.set(id, (debugCounts.get(id) || 0) + 1)
        const target = block.transparent ? transparent : opaque
        for (let f = 0; f < FACES.length; f++) {
          const face = FACES[f]
          const nx = x + face.dir[0]
          const ny = y + face.dir[1]
          const nz = z + face.dir[2]
          const neighbor = get(nx, ny, nz)
          if (block.transparent) {
            if (neighbor === id) continue
            if (isOpaque(neighbor)) continue
          } else {
            if (!shouldRenderFace(id, neighbor)) continue
          }
          const tile = faceTilesFor(atlas, id, face.uv)
          const uv = atlas.tileUV(tile)
          if (debugFaces && debugFaces.length < 20) {
            debugFaces.push({
              blockId: id,
              blockName: blockName(blocks, id),
              local: { x, y, z },
              face: face.uv,
              dir: face.dir,
              tile,
              uv
            })
          }
          if (DEBUG_TEXTURES && (block.name === 'stone' || block.name === 'grass')) {
            debugOnce(`mesh-face-${chunk.cx},${chunk.cz}-${block.name}-${face.uv}`, 'mesh', `first ${block.name} ${face.uv} face in chunk ${chunk.cx},${chunk.cz}`, {
              blockId: id,
              tile,
              uv,
              faceTiles: atlas.faceTiles(id),
              local: { x, y, z }
            })
          }
          const base = target.positions.length / 3
          const sh = face.shade

          const wx = chunk.cx * CHUNK_SIZE + nx
          const wy = ny
          const wz = chunk.cz * CHUNK_SIZE + nz
          let lightFactor = 1
          if (lightBuffer && nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < CHUNK_HEIGHT && nz >= 0 && nz < CHUNK_SIZE) {
            // Read sky light from the NEIGHBOR column's own skyMap entry,
            // not from (nx,ny,nz) in the buffer (which uses THIS chunk's
            // column and would be 0 under an overhang even for side faces).
            const skyMap = chunk.skyMap
            const neighborTop = skyMap ? skyMap[nz * CHUNK_SIZE + nx] : 255
            const skyMax = world?.dimension === 'nether'
              ? 0
              : Math.round((4 + daylightFactor(world?.timeOfDay || 0) * 11) * weatherSkyMultiplier(world))
            const neighborSky = neighborTop === 255 || ny > neighborTop ? skyMax : 0
            const neighborBlock = chunk.lightMap ? getBlockLightAtChunk(chunk, nx, ny, nz) : 0
            const neighborLight = Math.max(neighborSky, neighborBlock)
            lightFactor = Math.max(0.35, neighborLight / 15.0)
          } else if (world) {
            const skyLight = world.dimension === 'nether' ? 0 : getSkyLightFast(world, wx, wy, wz, world.timeOfDay || 0)
            const blockLight = getBlockLightAtChunk(chunk, nx, ny, nz)
            lightFactor = Math.max(0.35, Math.max(skyLight, blockLight) / 15.0)
          }
          const finalShade = sh * lightFactor

          const uvCoords = [
            [uv.u0, uv.v1],
            [uv.u1, uv.v1],
            [uv.u0, uv.v0],
            [uv.u1, uv.v0]
          ]
          const liquidTop = blocks[id]?.liquid && face.dir[1] === 1
          const liquidHeight = liquidTop ? 1 - chunk.getLevel(x, y, z) * 0.1 : 1
          for (let c = 0; c < 4; c++) {
            const corner = face.corners[c]
            const cy = liquidTop && corner[1] === 1 ? liquidHeight : corner[1]
            target.positions.push(x + corner[0], y + cy, z + corner[2])
            target.normals.push(face.dir[0], face.dir[1], face.dir[2])
            target.colors.push(finalShade, finalShade, finalShade)
            target.uvs.push(uvCoords[c][0], uvCoords[c][1])
          }
          target.indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3)
        }
      }
    }
  }

  const result = { opaque: null, transparent: null }
  if (opaque.positions.length > 0) {
    result.opaque = buildGeometry(opaque.positions, opaque.normals, opaque.colors, opaque.uvs, opaque.indices)
  }
  if (transparent.positions.length > 0) {
    result.transparent = buildGeometry(transparent.positions, transparent.normals, transparent.colors, transparent.uvs, transparent.indices)
  }
  if (DEBUG_TEXTURES) {
    debugLog('mesh', `chunk ${chunk.cx},${chunk.cz} meshed`, {
      blockCounts: [...debugCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 16)
        .map(([id, count]) => ({ id, name: blockName(blocks, id), count })),
      opaqueVertices: opaque.positions.length / 3,
      transparentVertices: transparent.positions.length / 3,
      sampleFaces: debugFaces
    })
  }
  return result
}
