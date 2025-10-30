class ExtensionWebSocket {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1 second
    this.pending = new Map(); // id -> {resolve, reject, timeoutId}
    this.defaultTimeout = 30000; // 30s per command
    this.connect();
  }

  

  connect() {
    try {
      this.ws = new WebSocket("ws://127.0.0.1:8000/ws");

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
      };

      this.ws.onmessage = (event) => {
        let data = null;
        try {
          data = JSON.parse(event.data);
        } catch (e) {
          console.error("[EXT] Failed to parse WebSocket message:", e);
          return;
        }

        // Resolve pending promises by id for result messages
        if (data && data.type === 'result' && data.id && this.pending.has(data.id)) {
          const entry = this.pending.get(data.id);
          this.pending.delete(data.id);
          clearTimeout(entry.timeoutId);
          if (data.status === 'ok') {
            entry.resolve(data);
          } else {
            entry.reject(data);
          }
          return;
        }

        // No request id to resolve; currently no-op
      };

      this.ws.onclose = (event) => {
        console.log("[EXT] WebSocket closed:", event.code, event.reason);
        // Reject all pending requests on close
        this.pending.forEach((entry, id) => {
          clearTimeout(entry.timeoutId);
          entry.reject({ type: 'error', message: 'WebSocket closed', id });
        });
        this.pending.clear();
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error("[EXT] WebSocket error:", error);
      };

    } catch (e) {
      console.error("[EXT] Failed to create WebSocket:", e);
      this.attemptReconnect();
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[EXT] Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${this.reconnectDelay}ms`);

      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay);

      // Exponential backoff
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    } else {
      console.error("[EXT] Max reconnection attempts reached. Giving up.");
    }
  }

  // Subscribers removed for simplicity; add back if streaming events are needed

  _send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    } else {
      console.warn("[EXT] WebSocket not connected. Message not sent:", message);
      return false;
    }
  }

  sendCommand(payload, options = {}) {
    const id = Date.now() + '-' + Math.random().toString(36).substring(2, 8);
  
    const message = { id, ...payload };
  
    const timeoutMs = options.timeoutMs || this.defaultTimeout;
  
    return new Promise((resolve, reject) => {
  
      if (!this._send(message)) {
        reject({ error: 'WebSocket not connected', id });
        return;
      }
  
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject({ error: 'Timeout', message: `No reply after ${timeoutMs}ms`, id });
      }, timeoutMs);
  
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  sendPing() {
    return this.sendCommand({ type: 'ping' }, { timeoutMs: 5000 });
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }
  }
}
