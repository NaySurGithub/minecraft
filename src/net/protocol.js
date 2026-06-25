// Wire protocol for host-authoritative P2P multiplayer.
//
// All messages are plain JSON objects with a `t` (type) field. Chunk blocks
// travel as base64-encoded Uint16 byte data inside the same JSON envelope to
// keep a single transport path. The host is authoritative for world state,
// mobs, drops, day/night time, and remote-player positions.

export const MSG = {
  // Client -> Host
  HELLO: 'hello',
  INPUT: 'input',
  BREAK_START: 'breakStart',
  BREAK_BLOCK: 'breakBlock',
  BREAK_RAY: 'breakRay',
  BREAK_STOP: 'breakStop',
  PLACE: 'place',
  ATTACK_MOB: 'attackMob',
  ATTACK_PLAYER: 'attackPlayer',
  TOSS: 'toss',
  CHAT: 'chat',
  COMMAND: 'command',
  HOTBAR_SELECT: 'hotbarSelect',
  CHUNK_REQUEST: 'chunkRequest',
  CHUNK_VISIBILITY: 'chunkVisibility',
  MOD_PACKET: 'modPacket',

  // Host -> Client
  WELCOME: 'welcome',
  CHUNK_DATA: 'chunkData',
  BLOCK_UPDATE: 'blockUpdate',
  BLOCK_UPDATES: 'blockUpdates',
  SNAPSHOT: 'snapshot',
  INVENTORY_SET: 'inventorySet',
  HEALTH_SET: 'healthSet',
  PEER_LEFT: 'peerLeft',
  CHEST_OPEN: 'chestOpen',
  CHEST_CLOSE: 'chestClose',
  CHEST_UPDATE: 'chestUpdate',
  CHEST_FACING: 'chestFacing',
  TELEPORT: 'teleport'
}

export const PROTOCOL_VERSION = 1

// Encode a Uint16Array as base64 in a way that survives JSON round trips.
// The byte view is taken from the same buffer so endianness matches between
// host and client (browsers are little-endian; this assumes the same).
export function encodeVoxels(typedArray) {
  const bytes = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength)
  let binary = ''
  // Chunk to avoid argument-length limits on very large arrays.
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step))
  }
  return btoa(binary)
}

export function decodeVoxels(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2)
}

export function encodeBytes(typedArray) {
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < typedArray.length; i += step) {
    binary += String.fromCharCode.apply(null, typedArray.subarray(i, i + step))
  }
  return btoa(binary)
}

export function decodeBytes(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
