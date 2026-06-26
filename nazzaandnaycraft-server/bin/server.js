#!/usr/bin/env node

const Server = require('../src/server');

const args = process.argv.slice(2);
const configPath = args[0] || 'server.json';

const server = new Server(configPath);

process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down...');
  server.stop();
  process.exit(0);
});

try {
  server.start();
  
  // Console input for commands
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (input) => {
    const trimmed = input.trim();
    if (!trimmed) return;
    
    if (trimmed.startsWith('/')) {
      // Handle console commands
      const parts = trimmed.slice(1).split(' ');
      const cmd = parts[0];
      const cmdArgs = parts.slice(1);
      
      switch (cmd) {
        case 'help':
          console.log('Available commands:');
          console.log('  /help - Show this help');
          console.log('  /list - List online players');
          console.log('  /stop - Stop the server');
          console.log('  /save - Save the world');
          break;
        case 'list':
          const players = Array.from(server.clients.values());
          console.log(`Players (${players.length}/${server.config.get('maxPlayers')}):`);
          for (const p of players) {
            console.log(`  - ${p.name}`);
          }
          break;
        case 'stop':
          console.log('Stopping server...');
          server.stop();
          process.exit(0);
        case 'save':
          server.world.saveAll();
          console.log('World saved');
          break;
        default:
          console.log(`Unknown command: ${cmd}`);
      }
    }
  });
  
} catch (error) {
  console.error('Failed to start server:', error.message);
  process.exit(1);
}
