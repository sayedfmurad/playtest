/*
  Minimal React mount for a Chrome content script without a bundler.
  - Loads React + ReactDOM from local extension files instead of CDN (MV3 CSP compliant)
  - Creates a floating panel that can render data and interact with the page
  - Uses the shared window.extensionWS created by content.js
*/
(function () {
  const REACT_URL = chrome.runtime.getURL('lib/react.production.min.js');
  const REACT_DOM_URL = chrome.runtime.getURL('lib/react-dom.production.min.js');

  async function loadAndEval(url) {
    const res = await fetch(url);
    const code = await res.text();
    // Evaluate in the content script's isolated world so globals attach to window
    // eslint-disable-next-line no-new-func
    new Function(code + '\n//# sourceURL=' + url)();
  }

  async function ensureReact() {
    if (!window.React) await loadAndEval(REACT_URL);
    if (!window.ReactDOM) await loadAndEval(REACT_DOM_URL);
  }

  function createRootContainer() {
    const id = 'playtest-react-root-container';
    let root = document.getElementById(id);
    if (root) return root;

    root = document.createElement('div');
    root.id = id;
    Object.assign(root.style, {
      position: 'fixed',
      bottom: '16px',
      right: '16px',
      zIndex: 2147483647,
      fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    });

    // Shadow DOM to avoid page CSS conflicts
    const shadowHost = document.createElement('div');
    shadowHost.style.all = 'initial';
    root.appendChild(shadowHost);

    document.documentElement.appendChild(root);
    return shadowHost.attachShadow({ mode: 'open' });
  }

  function injectStyles(shadowRoot) {
    const style = document.createElement('style');
    style.textContent = `
      .panel { background: #0b1020; color: #e6e9f5; border: 1px solid #243;
               box-shadow: 0 8px 30px rgba(0,0,0,0.35); border-radius: 12px;
               padding: 10px 12px; min-width: 260px; max-width: 380px; }
      .row { display: flex; align-items: center; gap: 8px; }
      .title { font-weight: 600; font-size: 13px; letter-spacing: .3px; }
      .muted { color: #aab2cc; font-size: 12px; }
      .btn { background: #3b82f6; color: white; border: 0; padding: 6px 10px;
             border-radius: 8px; cursor: pointer; font-size: 12px; }
      .btn:hover { background: #2f6bdc; }
      .badge { background: #12203a; color: #8fb3ff; border: 1px solid #1e2c4d;
               padding: 2px 6px; border-radius: 999px; font-size: 11px; }
    `;
    shadowRoot.appendChild(style);
  }

  function App({ ws }) {
    const React = window.React;
    const { useEffect, useState } = React;
    const [status, setStatus] = useState('connecting');
    const [lastMsg, setLastMsg] = useState(null);

    useEffect(() => {
      if (!ws) return;
      function update() {
        const s = ws.ws?.readyState;
        setStatus(s === 1 ? 'open' : s === 0 ? 'connecting' : 'closed');
      }
      update();
      const t = setInterval(update, 1000);
      const prev = ws.ws?.onmessage;
      ws.ws.onmessage = (evt) => {
        try { setLastMsg(JSON.parse(evt.data)); } catch { setLastMsg(evt.data); }
        if (typeof prev === 'function') prev(evt);
      };
      return () => { clearInterval(t); };
    }, [ws]);

    function ping() { try { ws.sendPing(); } catch {}
    }

    return React.createElement('div', { className: 'panel' },
      React.createElement('div', { className: 'row', style: { justifyContent: 'space-between' } },
        React.createElement('div', null,
          React.createElement('div', { className: 'title' }, 'Playtest'),
          React.createElement('div', { className: 'muted' }, document.title)
        ),
        React.createElement('div', { className: 'badge' }, status)
      ),
      React.createElement('div', { style: { height: 8 } }),
      React.createElement('div', { className: 'row', style: { justifyContent: 'space-between' } },
        React.createElement('button', { className: 'btn', onClick: ping }, 'Ping'),
        React.createElement('div', { className: 'muted' }, lastMsg ? JSON.stringify(lastMsg) : 'No messages yet')
      )
    );
  }

  async function init() {
    try {
      await ensureReact();
      const shadowRoot = createRootContainer();
      injectStyles(shadowRoot);
      const mount = document.createElement('div');
      shadowRoot.appendChild(mount);

      const render = () => {
        const React = window.React; const ReactDOM = window.ReactDOM;
        const el = React.createElement(App, { ws: window.extensionWS });
        if (!mount._root) {
          mount._root = ReactDOM.createRoot(mount);
        }
        mount._root.render(el);
      };

      if (window.extensionWS) render();
      else window.addEventListener('extensionWS-ready', render, { once: true });
    } catch (e) {
      console.error('[EXT] Failed to init React UI:', e);
    }
  }

  // Only run on top window
  if (window.top === window) {
    init();
  }
})();
