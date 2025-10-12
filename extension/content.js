// Initialize WebSocket connection
const extensionWS = new ExtensionWebSocket();

// Send periodic pings every 30 seconds to keep connection alive
setInterval(() => {
  extensionWS.sendPing();
}, 30000);


window.addEventListener('beforeunload', () => {
  extensionWS.close();
  observer.disconnect();
});
