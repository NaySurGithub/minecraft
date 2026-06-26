const WebSocket = require('ws');

/**
 * WebSocket server that speaks the same protocol as the P2P host.
 * Each client connection is wrapped to look like a peer connection.
 */
class WebSocketHost {
  constructor(port) {
    this.port = port;
    this.wss = null;
    this.clients = new Map(); // clientId -> { conn, ws }
    this.nextId = 1;
    this.onConnection = null;
    this.onMessage = null;
    this.onClose = null;
  }

  start(onConnection, onMessage, onClose) {
    this.onConnection = onConnection;
    this.onMessage = onMessage;
    this.onClose = onClose;

    this.wss = new WebSocket.Server({ port: this.port });

    this.wss.on('connection', (ws) => {
      const clientId = 'ws_' + (this.nextId++);
      
      // Wrap the WebSocket to look like a WebRTCConnection
      const conn = {
        id: clientId,
        ws: ws,
        open: true,
        onMessage: null,
        onClose: null,
        send: function(msg) {
          if (ws.readyState !== WebSocket.OPEN) return false;
          try {
            ws.send(JSON.stringify(msg));
            return true;
          } catch (e) {
            console.error('Send error:', e.message);
            return false;
          }
        },
        close: function() {
          try { ws.close(); } catch (e) {}
        }
      };

      this.clients.set(clientId, { conn: conn, ws: ws });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (this.onMessage) this.onMessage(clientId, msg);
        } catch (e) {
          console.error('Parse error:', e.message);
        }
      });

      ws.on('close', () => {
        conn.open = false;
        this.clients.delete(clientId);
        if (this.onClose) this.onClose(clientId);
      });

      ws.on('error', (err) => {
        console.error('Client ' + clientId + ' error:', err.message);
      });

      // Notify the handler about the new connection
      if (this.onConnection) this.onConnection(clientId, conn);
    });

    console.log('WebSocket host listening on port ' + this.port);
  }

  broadcast(msg, excludeId) {
    const data = JSON.stringify(msg);
    for (const [id, entry] of this.clients) {
      if (id !== excludeId && entry.conn.open && entry.ws.readyState === WebSocket.OPEN) {
        try {
          entry.ws.send(data);
        } catch (e) {
          console.error('Broadcast error:', e.message);
        }
      }
    }
  }

  send(clientId, msg) {
    const entry = this.clients.get(clientId);
    if (entry && entry.conn.open && entry.ws.readyState === WebSocket.OPEN) {
      try {
        entry.ws.send(JSON.stringify(msg));
      } catch (e) {
        console.error('Send error:', e.message);
      }
    }
  }

  stop() {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }

  getClientCount() {
    return this.clients.size;
  }
}

module.exports = WebSocketHost;
