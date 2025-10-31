(function(){
  const React = window.React;

  function App() {
    const { useEffect, useState } = React;
    const [status, setStatus] = useState('connecting');
    const [lastMsg, setLastMsg] = useState(null);
    const [scriptName, setScriptName] = useState(null);

    useEffect(() => {
      sendToTab({ type: 'get_status' }).then((res) => {
        if (res && res.status) setStatus(res.status);
        else setStatus('unknown');
      });
    }, []);

    function ping() {
      sendToTab({ type: 'popup_ping' }).then((res) => {
        setLastMsg(res || { ok: false });
        sendToTab({ type: 'get_status' }).then((s) => {
          if (s && s.status) setStatus(s.status);
        });
      });
    }

    return React.createElement(React.Fragment, null,
      React.createElement(Header, { status, onPing: ping, lastMsg, scriptName }),
      React.createElement('div', { className: 'p-3 mb-5' },
        React.createElement(StepsBuilder, { onScriptNameChange: setScriptName })
      )
    );
  }

  window.App = App;
})();

