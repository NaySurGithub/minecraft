const Server = require('./src/server');

const server = new Server('server.json');

server.start();

// Keep the server running until manually stopped (Ctrl+C)
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
