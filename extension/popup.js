(function(){
  const React = window.React;
  const ReactDOM = window.ReactDOM;

  function App() {
    const { useEffect, useState } = React;
    const [status, setStatus] = useState('connecting');
    const [lastMsg, setLastMsg] = useState(null);

    // On mount, ask the active tab's content script for current WS status
    useEffect(() => {
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tabId = tabs && tabs[0] && tabs[0].id;
          if (!tabId) return;
          chrome.tabs.sendMessage(tabId, { type: 'get_status' }, (res) => {
            if (chrome.runtime.lastError) return; // content script may not be injected on this page
            if (res && res.status) setStatus(res.status);
          });
        });
      } catch {}
    }, []);

    function ping() {
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tabId = tabs && tabs[0] && tabs[0].id;
          if (!tabId) return;
          chrome.tabs.sendMessage(tabId, { type: 'popup_ping' }, (res) => {
            if (chrome.runtime.lastError) {
              setLastMsg({ error: chrome.runtime.lastError.message });
              return;
            }
            setLastMsg(res || { ok: false });
            // refresh status after ping
            chrome.tabs.sendMessage(tabId, { type: 'get_status' }, (s) => {
              if (s && s.status) setStatus(s.status);
            });
          });
        });
      } catch (e) {
        setLastMsg({ error: String(e) });
      }
    }

    return React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'header' },
        React.createElement('div', { className: 'title' }, 'Playtest'),
        React.createElement('span', { className: 'badge' }, status)
      ),
      React.createElement('div', { className: 'body' },
        React.createElement('div', { className: 'row' },
          React.createElement('button', { className: 'btn', onClick: ping }, 'Ping'),
          React.createElement('span', { className: 'small' }, lastMsg ? JSON.stringify(lastMsg) : 'No messages yet')
        )
      )
    );
  }

  function mount(){
    const root = document.getElementById('root');
    if (!root._r) root._r = ReactDOM.createRoot(root);
    root._r.render(React.createElement(App));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
