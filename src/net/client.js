class MultiplayerClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.playerId = null;
    this.uuid = null;
    this.handlers = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect(address, port = 25565) {
    return new Promise((resolve, reject) => {
      const url = `ws://${address}:${port}`;
      
      try {
        this.ws = new WebSocket(url);
      } catch (error) {
        reject(error);
        return;
      }

      this.ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        console.log('Connected to server');
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = () => {
        this.connected = false;
        console.log('Disconnected from server');
        this.trigger('disconnect');
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };
    });
  }

  handleMessage(message) {
    try {
      const packet = JSON.parse(message);
      if (!packet.type) return;

      const handler = this.handlers.get(packet.type);
      if (handler) {
        handler(packet.data);
      }

      this.trigger('packet', packet);
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  send(type, data) {
    if (!this.connected || !this.ws) return;
    
    const message = JSON.stringify({
      type,
      data,
      timestamp: Date.now()
    });
    
    this.ws.send(message);
  }

  login(username) {
    this.send('auth:login', { username });
  }

  move(x, y, z) {
    this.send('player:move', { x, y, z });
  }

  rotate(yaw, pitch) {
    this.send('player:rotate', { yaw, pitch });
  }

  placeBlock(x, y, z, blockId) {
    this.send('block:place', { x, y, z, blockId });
  }

  breakBlock(x, y, z) {
    this.send('block:break', { x, y, z });
  }

  sendChat(text) {
    this.send('chat:message', { text });
  }

  requestChunk(cx, cz) {
    this.send('world:requestChunk', { cx, cz });
  }

  ping() {
    this.send('ping', {});
  }

  on(type, handler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type).push(handler);
  }

  off(type, handler) {
    if (!this.handlers.has(type)) return;
    
    const handlers = this.handlers.get(type);
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  trigger(type, data) {
    if (!this.handlers.has(type)) return;
    
    const handlers = this.handlers.get(type);
    handlers.forEach(handler => handler(data));
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

export default MultiplayerClient;
