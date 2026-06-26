class CommandHandler {
  constructor(server) {
    this.server = server;
    this.commands = new Map();
    this.registerDefaults();
  }

  registerDefaults() {
    this.register('help', (args) => {
      console.log('Available commands:');
      for (const [name] of this.commands) {
        console.log(`  /${name}`);
      }
    });

    this.register('list', (args) => {
      const players = Array.from(this.server.players.values());
      console.log(`Players (${players.length}/${this.server.config.get('maxPlayers')}):`);
      for (const player of players) {
        console.log(`  - ${player.username}`);
      }
    });

    this.register('kick', (args) => {
      if (args.length < 1) {
        console.log('Usage: /kick <username>');
        return;
      }
      const username = args[0];
      for (const [id, player] of this.server.players) {
        if (player.username === username) {
          this.server.wsServer.send(id, 'kick', { reason: 'Kicked by console' });
          console.log(`Kicked ${username}`);
          return;
        }
      }
      console.log(`Player ${username} not found`);
    });

    this.register('stop', (args) => {
      console.log('Stopping server...');
      this.server.stop();
      process.exit(0);
    });

    this.register('save', (args) => {
      this.server.world.saveAll();
      console.log('World saved');
    });
  }

  register(name, handler) {
    this.commands.set(name, handler);
  }

  execute(input) {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) return false;

    const parts = trimmed.substring(1).split(' ');
    const command = parts[0];
    const args = parts.slice(1);

    const handler = this.commands.get(command);
    if (handler) {
      try {
        handler(args);
      } catch (error) {
        console.error(`Error executing command: ${error.message}`);
      }
      return true;
    }

    console.log(`Unknown command: ${command}`);
    return false;
  }
}

module.exports = CommandHandler;
