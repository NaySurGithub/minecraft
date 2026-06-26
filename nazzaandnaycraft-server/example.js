const Server = require('./src/server');

const server = new Server('server.json');


if (process.env.PORT) {
  server.config.port = Number(process.env.PORT);
}

server.start();

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