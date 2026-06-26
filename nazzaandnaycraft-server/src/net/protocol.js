/**
 * Protocol constants matching the client's MSG definitions.
 * This ensures the dedicated server speaks the same language as the P2P host.
 */
const MSG = {
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
  PICKUP_REQUEST: 'pickupRequest',
  CRAFT_REQUEST: 'craftRequest',
  GAMEMODE_REQUEST: 'gamemodeRequest',

  // Host -> Client
  WELCOME: 'welcome',
  CHUNK_DATA: 'chunkData',
  BLOCK_UPDATE: 'blockUpdate',
  BLOCK_UPDATES: 'blockUpdates',
  SNAPSHOT: 'snapshot',
  INVENTORY_SET: 'inventorySet',
  INVENTORY_DENY: 'inventoryDeny',
  GAMEMODE_SET: 'gamemodeSet',
  HEALTH_SET: 'healthSet',
  PEER_LEFT: 'peerLeft',
  CHEST_OPEN: 'chestOpen',
  CHEST_CLOSE: 'chestClose',
  CHEST_UPDATE: 'chestUpdate',
  CHEST_FACING: 'chestFacing',
  TELEPORT: 'teleport',

  // Server Browser ping (lightweight, no full handshake)
  STATUS: 'status',
  STATUS_RESPONSE: 'statusResponse'
};

const PROTOCOL_VERSION = 1;

/**
 * Encode a Uint16Array as base64 for wire transmission.
 */
function encodeVoxels(typedArray) {
  const bytes = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  }
  return Buffer.from(binary, 'binary').toString('base64');
}

/**
 * Decode base64 back to Uint16Array.
 */
function decodeVoxels(b64) {
  const binary = Buffer.from(b64, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}

/**
 * Encode a Uint8Array as base64.
 */
function encodeBytes(typedArray) {
  return Buffer.from(typedArray).toString('base64');
}

/**
 * Decode base64 back to Uint8Array.
 */
function decodeBytes(b64) {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

module.exports = {
  MSG,
  PROTOCOL_VERSION,
  encodeVoxels,
  decodeVoxels,
  encodeBytes,
  decodeBytes
};
