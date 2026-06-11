const { WebSocketServer } = require('ws');

let wss = null;

function startWebSocketServer() {
  wss = new WebSocketServer({ port: 3001 });
  wss.on('connection', (ws) => {
    console.log('[ws] client connected');
    ws.on('close', () => console.log('[ws] client disconnected'));
  });
  console.log('[ws] server listening on ws://localhost:3001');
}

// Broadcast a job update to all connected dashboard clients
function broadcastJobUpdate(job) {
  if (!wss) return;
  const msg = JSON.stringify({ type: 'job_update', job });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

module.exports = { startWebSocketServer, broadcastJobUpdate };
