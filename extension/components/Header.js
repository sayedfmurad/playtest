(function(){
  const React = window.React;

  function Header({ status, onPing, lastMsg, scriptName }){
    return React.createElement('div', { className: 'flex items-center justify-between p-3 border-b border-slate-700 bg-slate-900' },
        React.createElement('div', { className: 'font-semibold text-slate-100' },  `Playtest${scriptName ? " | "+scriptName : ""}` ),
        React.createElement('div', { className: 'flex items-center gap-2 flex-wrap' },
              React.createElement('button', { className: 'bg-slate-700 text-slate-200 border border-slate-600 px-3 py-1.5 rounded-lg text-xs hover:bg-slate-600', onClick: onPing }, 'Ping'),
              React.createElement('span', { className: 'bg-slate-800 text-blue-300 border border-slate-600 px-2 py-1 rounded-full text-xs' }, status),
              lastMsg ? React.createElement('span', { className: 'text-slate-400 text-xs ml-2' }, JSON.stringify(lastMsg)) : null
        )
    );
  }

  window.Header = Header;
})();

