// Initialize shared WebSocket connection (singleton)
if (!window.extensionWS) {
  const ws = new ExtensionWebSocket();
  window.extensionWS = ws;

  // Keep-alive ping every 30 seconds
  window._extensionWSKeepAlive = setInterval(() => {
    try {
      window.extensionWS?.sendPing();
    } catch (e) {
      console.warn('[EXT] Ping failed:', e);
    }
  }, 30000);

  // Notify listeners (e.g., UI) that WS is ready
  window.dispatchEvent(new CustomEvent('extensionWS-ready'));

  window.addEventListener('beforeunload', () => {
    try { clearInterval(window._extensionWSKeepAlive); } catch {}
    try { window.extensionWS?.close(); } catch {}
  });
}

// Allow popup to communicate with this content script
try {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'popup_ping') {
      try {
        window.extensionWS?.sendPing();
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return true;
    }

    if (msg.type === 'get_status') {
      const s = window.extensionWS?.ws?.readyState;
      const status = s === 1 ? 'open' : s === 0 ? 'connecting' : 'closed';
      sendResponse({ status });
      return true;
    }
  });
} catch (e) {
  console.warn('[EXT] runtime messaging unavailable:', e);
}
