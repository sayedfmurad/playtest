(function(){
  const React = window.React;

  function App() {
    const { useState } = React;
    const [statusData, setStatusData] = useState({ status: 'connecting', scriptName: null });

    return React.createElement(React.Fragment, null,
      React.createElement(Header, { status: statusData.status, scriptName: statusData.scriptName }),
      React.createElement('div', { className: 'p-3 mb-5' },
        React.createElement(StepsBuilder, { 
          onStatusChange: setStatusData
        })
      )
    );
  }

  window.App = App;
})();

