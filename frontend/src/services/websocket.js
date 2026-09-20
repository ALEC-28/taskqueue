const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

class WebSocketService {
  constructor() {
    this.ws = null;
    this.subscribers = new Set();
    this.statusSubscribers = new Set();
    this.isConnected = false;
    this.reconnectTimer = null;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log('[WS] Connected to FedOrch Real-Time Stream');
        this.isConnected = true;
        this.notifyStatus(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.notifySubscribers(data);
        } catch (err) {
          console.error('[WS] Parse error:', err);
        }
      };

      this.ws.onerror = (err) => {
        console.error('[WS] Connection error:', err);
      };

      this.ws.onclose = () => {
        console.log('[WS] Disconnected. Reconnecting in 3s...');
        this.isConnected = false;
        this.notifyStatus(false);
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      };
    } catch (err) {
      console.error('[WS] Connection exception:', err);
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    }
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  subscribeStatus(callback) {
    this.statusSubscribers.add(callback);
    callback(this.isConnected);
    return () => this.statusSubscribers.delete(callback);
  }

  notifySubscribers(data) {
    this.subscribers.forEach((cb) => cb(data));
  }

  notifyStatus(status) {
    this.statusSubscribers.forEach((cb) => cb(status));
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
  }
}

export const wsService = new WebSocketService();
