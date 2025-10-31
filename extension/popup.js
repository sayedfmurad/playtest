(function(){
  const React = window.React;
  const ReactDOM = window.ReactDOM;

  function mount(){
    const root = document.getElementById('root');
    if (!root.RootObject) root.RootObject = ReactDOM.createRoot(root);
    root.RootObject.render(React.createElement(App));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
