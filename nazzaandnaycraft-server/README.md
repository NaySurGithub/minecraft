# NazzaNayCraft Server

Dedicated multiplayer server for NazzaNayCraft.

## Installation

```bash
npm install
```

## Usage

### Start Server

```bash
npm start
```

Or with custom config:

```bash
npm start -- path/to/server.json
```

### Development

```bash
npm run dev
```

## Configuration

Create a `server.json` file:

```json
{
  "port": 25565,
  "maxPlayers": 20,
  "worldName": "world",
  "gamemode": "survival",
  "difficulty": "normal",
  "pvp": true,
  "whitelist": false,
  "motd": "A NazzaNayCraft Server",
  "spawnProtection": 16,
  "viewDistance": 10
}
```

## Features

- WebSocket-based multiplayer
- World generation and persistence
- Player position sync
- Block place/break
- Chat system
- Multiple gamemodes

## Network Protocol

### Client → Server

- `auth:login` - Authenticate and join
- `player:move` - Update position
- `player:rotate` - Update rotation
- `block:place` - Place a block
- `block:break` - Break a block
- `chat:message` - Send chat message
- `world:requestChunk` - Request chunk data
- `ping` - Ping server

### Server → Client

- `auth:success` - Login successful
- `auth:error` - Login failed
- `player:join` - Player joined
- `player:leave` - Player left
- `player:move` - Player moved
- `player:rotate` - Player rotated
- `block:update` - Block changed
- `chat:message` - Chat message
- `world:chunk` - Chunk data
- `pong` - Pong response

## License

MIT
