class ExtensionWebSocket {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1 second
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
        try {
          const data = JSON.parse(event.data);
          // Handle different response types
          switch (data.type) {
            case "pong":
              console.log("[EXT] Pong received:", data.message);
              break;
            case "page_response":
              console.log("[EXT] Page info processed:", data.processed_data);
              break;
            case "echo":
              console.log("[EXT] Echo response:", data.original);
              break;
            case "error":
              console.error("[EXT] Server error:", data.message);
              break;
          }
        } catch (e) {
          console.error("[EXT] Failed to parse WebSocket message:", e);
        }
      };

      this.ws.onclose = (event) => {
        console.log("[EXT] WebSocket closed:", event.code, event.reason);
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

  sendMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn("[EXT] WebSocket not connected. Message not sent:", message);
    }
  }

  sendPing() {
    this.sendMessage({
      type: "ping",
      data: {
        url: window.location.href,
        timestamp: Date.now()
      }
    });
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}
