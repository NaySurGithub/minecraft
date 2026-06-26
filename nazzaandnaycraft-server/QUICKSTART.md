# Quick Start Guide

## Start a Server in 30 Seconds

### Step 1: Install Dependencies
```bash
cd nazzaandnaycraft-server
npm install
```

### Step 2: Start the Server
```bash
npm start
```

That's it! Your server is now running on port 25565.

## Connect from the Game

1. Open NazzaNayCraft
2. Click "Serveurs" (Servers) in the main menu
3. Click "Add Server"
4. Enter:
   - **Name**: My Server
   - **Address**: localhost:25565
5. Click "Done"
6. Select your server and click "Join Server"

## Configuration

Edit `server.json` to customize your server:

```json
{
  "port": 25565,
  "maxPlayers": 20,
  "worldName": "world",
  "gamemode": "survival",
  "motd": "Welcome to my server!"
}
```

Restart the server after changing the config.

## Advanced Usage

### Custom Config File
```bash
npm start -- myserver.json
```

### Programmatic API
```javascript
const Server = require('nazzaandnaycraft-server');

const server = new Server({
  port: 25565,
  maxPlayers: 50,
  gamemode: 'creative'
});

server.start();
```

## Network Protocol

The server uses WebSocket protocol. See README.md for full protocol documentation.

## Troubleshooting

**Port already in use?**
Change the port in `server.json`

**Can't connect from another computer?**
- Make sure port 25565 is open in your firewall
- Use your public IP address (find it at whatismyip.com)

**Server crashes?**
Check the console output for error messages.
