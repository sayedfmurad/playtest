(function(){
  const React = window.React;
  const ReactDOM = window.ReactDOM;

  const API = 'http://127.0.0.1:8000';

  function useTargetTabId() {
    const { useState, useEffect } = React;
    const [tabId, setTabId] = useState(null);

    useEffect(() => {
      async function pickTarget() {
        try {
          const { playtest_targetTabId, playtest_targetWindowId } = await chrome.storage.local.get(['playtest_targetTabId', 'playtest_targetWindowId']);
          if (playtest_targetTabId) {
            try {
              const t = await chrome.tabs.get(playtest_targetTabId);
              if (t && t.id) {
                setTabId(t.id);
                return;
              }
            } catch {}
          }
          if (playtest_targetWindowId) {
            try {
              const tabs = await chrome.tabs.query({ windowId: playtest_targetWindowId, active: true });
              if (tabs && tabs[0] && tabs[0].id) {
                setTabId(tabs[0].id);
                return;
              }
            } catch {}
          }
          // Fallback: find an active tab in any normal window that isn't an extension page
          try {
            const wins = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
            for (const w of wins) {
              const active = (w.tabs || []).find(tb => tb.active && !(tb.url || '').startsWith('chrome-extension://'));
              if (active) {
                setTabId(active.id);
                return;
              }
            }
          } catch {}
          setTabId(null);
        } catch {
          setTabId(null);
        }
      }
      pickTarget();

      // React to background updates when user clicks the toolbar icon on another tab
      function onStorage(changes, area) {
        if (area !== 'local') return;
        if (changes.playtest_targetTabId || changes.playtest_targetWindowId) {
          // re-evaluate target
          pickTarget();
        }
      }
      try { chrome.storage.onChanged.addListener(onStorage); } catch {}
      return () => { try { chrome.storage.onChanged.removeListener(onStorage); } catch {} };
    }, []);

    return tabId;
  }

  function sendToTab(tabId, msg) {
    return new Promise((resolve) => {
      if (!tabId) return resolve({ ok: false, error: 'No target tab' });
      try {
        chrome.tabs.sendMessage(tabId, msg, (res) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(res);
          }
        });
      } catch (e) {
        resolve({ ok: false, error: String(e) });
      }
    });
  }

  const ACTIONS = [
    { value: 'goto', label: 'Goto URL', needsSelector: false, needsValue: true, valuePlaceholder: 'https://example.com' },
    { value: 'click', label: 'Click', needsSelector: true },
    { value: 'clickPosition', label: 'Click Position (X,Y)', needsSelector: false, needsValue: true, valuePlaceholder: '{"x": 100, "y": 200}', needsPositionPicker: true },
    { value: 'dblclick', label: 'Double click', needsSelector: true },
    { value: 'hover', label: 'Hover', needsSelector: true },
    { value: 'fill', label: 'Fill input', needsSelector: true, needsValue: true, valuePlaceholder: 'text' },
    { value: 'type', label: 'Type (raw)', needsSelector: true, needsValue: true, valuePlaceholder: 'text' },
    { value: 'press', label: 'Press key', needsSelector: true, needsValue: true, valuePlaceholder: 'Enter' },
    { value: 'selectOption', label: 'Select option', needsSelector: true, needsValue: true, valuePlaceholder: 'value' },
    { value: 'waitForVisible', label: 'Wait visible', needsSelector: true },
    { value: 'waitForHidden', label: 'Wait hidden', needsSelector: true },
    { value: 'waitTimeout', label: 'Wait timeout (ms)', needsSelector: false, needsValue: true, valuePlaceholder: '1000' },
    { value: 'expectExists', label: 'Assert exists', needsSelector: true },
    { value: 'expectNotExists', label: 'Assert not exists', needsSelector: true },
    { value: 'expectTextContains', label: 'Assert text contains', needsSelector: true, needsValue: true, valuePlaceholder: 'needle' },
    { value: 'expectUrlMatches', label: 'Assert URL matches (regex)', needsSelector: false, needsValue: true, valuePlaceholder: 'pattern' },
    { value: 'expectTitle', label: 'Assert title', needsSelector: false, needsValue: true, valuePlaceholder: 'title' },
    { value: 'getText', label: 'Get text', needsSelector: true },
    { value: 'getAttribute', label: 'Get attribute (value=attr name)', needsSelector: true, needsValue: true, valuePlaceholder: 'aria-label' },
    { value: 'getValue', label: 'Get value', needsSelector: true },
    { value: 'screenshot', label: 'Screenshot', needsSelector: false },
  ];

  function blankStep(index = 0) {
    return {
      id: `${Date.now()}-${Math.floor(Math.random()*1e6)}`,
      name: `Task ${index + 1}`,
      action: 'click',
      selector: '',
      value: '',
      optionsText: '',
      storeAs: '',
      status: 'idle', // idle | processing | ok | error
      error: '',
      enabled: true,
    };
  }

  async function apiList() {
    const r = await fetch(`${API}/scripts`);
    return r.json();
  }
  async function apiLoad(name) {
    const r = await fetch(`${API}/scripts/${encodeURIComponent(name)}`);
    if (!r.ok) throw new Error('Load failed');
    return r.json();
  }
  async function apiSave(name, steps) {
    const r = await fetch(`${API}/scripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, steps })
    });
    if (!r.ok) throw new Error('Save failed');
    return r.json();
  }

  function Header({ status, onPing, lastMsg, scriptName }){
    return React.createElement('div', { className: 'flex items-center justify-between p-3 border-b border-slate-700 bg-slate-900' },
      React.createElement('div', { className: 'font-semibold tracking-wide text-slate-100' }, scriptName ? `Playtest | ${scriptName}` : 'Playtest'),
      React.createElement('div', { className: 'flex items-center gap-2 flex-wrap' },
        React.createElement('button', { className: 'bg-slate-700 text-slate-200 border border-slate-600 px-3 py-1.5 rounded-lg text-xs hover:bg-slate-600', onClick: onPing }, 'Ping'),
        React.createElement('span', { className: 'bg-slate-800 text-blue-300 border border-slate-600 px-2 py-1 rounded-full text-xs' }, status),
        lastMsg ? React.createElement('span', { className: 'text-slate-400 text-xs ml-2' }, JSON.stringify(lastMsg)) : null
      )
    );
  }

  function StepsBuilder({ tabId, onScriptNameChange }){
    const { useState, useEffect } = React;
    const [steps, setSteps] = useState([blankStep(0)]);
    const [runningAll, setRunningAll] = useState(false);
    const [stopOnError, setStopOnError] = useState(true);
    const [scripts, setScripts] = useState([]);
    const [saving, setSaving] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [saveName, setSaveName] = useState('');
    const [showLoadModal, setShowLoadModal] = useState(false);
    const [currentScriptName, setCurrentScriptName] = useState(null);

    // Persist to storage
    useEffect(() => {
      try { chrome.storage?.local?.set({ playtest_steps: steps, playtest_stopOnError: stopOnError }); } catch {}
    }, [steps, stopOnError]);

    // Notify parent of script name changes
    useEffect(() => {
      if (onScriptNameChange) onScriptNameChange(currentScriptName);
    }, [currentScriptName, onScriptNameChange]);

    // Restore on mount and fetch scripts list
    useEffect(() => {
      try {
        chrome.storage?.local?.get(['playtest_steps', 'playtest_stopOnError'], (res) => {
          if (res && Array.isArray(res.playtest_steps) && res.playtest_steps.length) setSteps(res.playtest_steps);
          if (typeof res.playtest_stopOnError === 'boolean') setStopOnError(res.playtest_stopOnError);
        });
      } catch {}
      apiList().then(d => setScripts(d.items || [])).catch(() => setScripts([]));
    }, []);

    // Live update from content when steps run while popup closed
    useEffect(() => {
      function onMsg(msg) {
        if (!msg || msg.type !== 'step_result') return;
        setSteps((arr) => arr.map(s => (s.id === msg.uiId ? {
          ...s,
          status: msg.response && msg.response.status === 'ok' ? 'ok' : (msg.error || (msg.response && msg.response.error) ? 'error' : s.status),
          error: (msg.error && (msg.error.message || String(msg.error))) || (msg.response && msg.response.error && msg.response.error.message) || ''
        } : s)));
      }
      try { chrome.runtime.onMessage.addListener(onMsg); } catch {}
      return () => { try { chrome.runtime.onMessage.removeListener(onMsg); } catch {} };
    }, []);

    function updateStep(id, patch) {
      setSteps((arr) => arr.map(s => s.id === id ? { ...s, ...patch } : s));
    }

    function addStep() {
      setSteps((arr) => [...arr, blankStep(arr.length)]);
    }

    function deleteStep(id) {
      setSteps((arr) => arr.filter(s => s.id !== id));
    }

    function duplicateStep(id) {
      setSteps((arr) => {
        const idx = arr.findIndex(s => s.id === id);
        if (idx === -1) return arr;
        const copy = { ...arr[idx], id: `${Date.now()}-${Math.floor(Math.random()*1e6)}`, name: `${arr[idx].name} (copy)`, status: 'idle', error: '' };
        const out = arr.slice();
        out.splice(idx+1, 0, copy);
        return out;
      });
    }

    function moveStep(id, dir) {
      setSteps((arr) => {
        const idx = arr.findIndex(s => s.id === id);
        if (idx === -1) return arr;
        const j = idx + dir;
        if (j < 0 || j >= arr.length) return arr;
        const out = arr.slice();
        const tmp = out[idx];
        out[idx] = out[j];
        out[j] = tmp;
        return out;
      });
    }

    async function pickSelector(id) {
      const res = await sendToTab(tabId, { type: 'start_picker' });
      if (res && res.ok && res.selector) updateStep(id, { selector: res.selector });
    }

    async function pickPosition(id) {
      const res = await sendToTab(tabId, { type: 'start_position_picker' });
      if (res && res.ok && res.position) {
        const posValue = JSON.stringify(res.position);
        updateStep(id, { value: posValue });
      }
    }

    function parseOptions(text) {
      if (!text || !text.trim()) return undefined;
      try { return JSON.parse(text); } catch { return { raw: text }; }
    }

    async function playOne(step) {
      if (!tabId) return { ok: false, error: 'No tab' };
      const actionMeta = ACTIONS.find(a => a.value === step.action) || {};
      if (actionMeta.needsSelector && !step.selector) return { ok: false, error: 'Selector required' };
      if (actionMeta.needsValue && (step.value === '' || step.value === undefined)) return { ok: false, error: 'Value required' };

      updateStep(step.id, { status: 'processing', error: '' });

      const one = { action: step.action, uiId: step.id };
      if (step.selector) one.target = { selector: step.selector };
      if (step.value !== '' && step.value !== undefined) one.value = step.value;
      const opts = parseOptions(step.optionsText);
      if (opts) one.options = opts;
      if ((step.storeAs || '').trim()) one.storeAs = step.storeAs.trim();

      const res = await sendToTab(tabId, { type: 'run_steps', steps: [one] });
      const first = res && res.results && res.results[0];
      const ok = !!(first && first.response && first.response.status === 'ok');
      if (ok) {
        updateStep(step.id, { status: 'ok', error: '' });
        return { ok: true };
      } else {
        const err = (first && (first.error || (first.response && first.response.error))) || res?.error || 'Unknown error';
        const msg = typeof err === 'string' ? err : (err.message || JSON.stringify(err));
        updateStep(step.id, { status: 'error', error: msg });
        return { ok: false, error: msg };
      }
    }

    async function playAll() {
      if (!tabId) return;
      setRunningAll(true);
      try {
        for (const s of steps) {
          if (!s.enabled) continue;
          const r = await playOne(s);
          if (!r.ok && stopOnError) break;
        }
      } finally {
        setRunningAll(false);
      }
    }

    async function onSave() {
      if (currentScriptName) {
        saveCurrent();
      } else {
        setShowSaveModal(true);
      }
    }

    async function confirmSave() {
      const name = saveName.trim();
      if (!name) return;
      setSaving(true);
      try {
        const out = steps.map(s => {
          const d = { action: s.action };
          if (s.name) d.name = s.name;
          if (s.selector) d.target = { selector: s.selector };
          if (s.value !== '' && s.value !== undefined) d.value = s.value;
          if (s.optionsText) { try { d.options = JSON.parse(s.optionsText); } catch { d.optionsText = s.optionsText; } }
          if (s.storeAs) d.storeAs = s.storeAs;
          if (s.enabled === false) d.enabled = false;
          return d;
        });
        await apiSave(name, out);
        const lst = await apiList();
        setScripts(lst.items || []);
        setCurrentScriptName(name);
      } catch (e) {
        alert('Save failed: ' + String(e));
      } finally {
        setSaving(false);
        setShowSaveModal(false);
        setSaveName('');
      }
    }

    async function saveCurrent() {
      if (!currentScriptName) return;
      setSaving(true);
      try {
        const out = steps.map(s => {
          const d = { action: s.action };
          if (s.name) d.name = s.name;
          if (s.selector) d.target = { selector: s.selector };
          if (s.value !== '' && s.value !== undefined) d.value = s.value;
          if (s.optionsText) { try { d.options = JSON.parse(s.optionsText); } catch { d.optionsText = s.optionsText; } }
          if (s.storeAs) d.storeAs = s.storeAs;
          if (s.enabled === false) d.enabled = false;
          return d;
        });
        await apiSave(currentScriptName, out);
        const lst = await apiList();
        setScripts(lst.items || []);

      } catch (e) {
        alert('Save failed: ' + String(e));
      } finally {
        setSaving(false);
      }
    }

    async function onLoad(name) {
      if (!name) return;
      try {
        const data = await apiLoad(name);
        const loaded = (data.steps || []).map((s, idx) => ({
          id: `${Date.now()}-${Math.floor(Math.random()*1e6)}`,
          name: s.name || `Task ${idx + 1}`,
          action: s.action || 'click',
          selector: (s.target && s.target.selector) || s.selector || '',
          value: s.value || '',
          optionsText: s.options ? JSON.stringify(s.options) : (s.optionsText || ''),
          storeAs: s.storeAs || '',
          status: 'idle', error: '', enabled: s.enabled !== false
        }));
        setSteps(loaded.length ? loaded : [blankStep(0)]);
      } catch (e) {
        alert('Load failed: ' + String(e));
      }
    }

    async function loadScript(name) {
      try {
        const data = await apiLoad(name);
        const loaded = (data.steps || []).map((s, idx) => ({
          id: `${Date.now()}-${Math.floor(Math.random()*1e6)}`,
          name: s.name || `Task ${idx + 1}`,
          action: s.action || 'click',
          selector: (s.target && s.target.selector) || s.selector || '',
          value: s.value || '',
          optionsText: s.options ? JSON.stringify(s.options) : (s.optionsText || ''),
          storeAs: s.storeAs || '',
          status: 'idle', error: '', enabled: s.enabled !== false
        }));
        setSteps(loaded.length ? loaded : [blankStep(0)]);
        setCurrentScriptName(name);
        setShowLoadModal(false);
      } catch (e) {
        alert('Load failed: ' + String(e));
      }
    }

    function onNew() {
      setSteps([blankStep(0)]);
      setCurrentScriptName(null);
    }

    return React.createElement('div', { className: 'grid gap-3' },
      !tabId && React.createElement('div', { className: 'text-slate-400 text-sm p-4 bg-slate-800 rounded-lg' }, 'No target tab. Click the extension icon on the page you want to control.'),
      React.createElement('div', { className: 'flex items-center gap-2 flex-wrap p-3 bg-slate-900 border-b border-slate-700' },
        React.createElement('button', { className: 'bg-slate-700 text-slate-200 border border-slate-600 px-3 py-1.5 rounded-lg text-xs hover:bg-slate-600', onClick: onNew }, 'New'),
        React.createElement('button', { className: 'bg-slate-700 text-slate-200 border border-slate-600 px-3 py-1.5 rounded-lg text-xs hover:bg-slate-600', onClick: () => setShowLoadModal(true) }, 'Load'),
        React.createElement('button', { className: 'bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-blue-700 disabled:opacity-50', onClick: onSave, disabled: saving }, saving ? 'Saving…' : 'Save'),
        React.createElement('button', { className: 'bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-blue-700', onClick: addStep }, '+ Add Step'),
        React.createElement('label', { className: 'text-slate-400 text-xs ml-2 flex items-center gap-1' },
          React.createElement('input', { type: 'checkbox', checked: stopOnError, onChange: e => setStopOnError(e.target.checked) }),
          ' Stop on error'
        ),
        React.createElement('button', { className: 'bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-blue-700', onClick: playAll }, runningAll ? 'Running…' : 'Run all')
      ),
      steps.map((s, idx) => {
        const actionMeta = ACTIONS.find(a => a.value === s.action) || {};
        return React.createElement('div', { key: s.id, className: 'border border-slate-700 rounded-xl p-3 bg-slate-800 grid gap-2' },
          React.createElement('div', { className: 'flex items-center gap-2 mb-1' },
            React.createElement('input', {
              type: 'text',
              className: 'flex-1 bg-transparent border-none text-slate-100 text-sm font-medium px-2 py-1 rounded outline-none hover:bg-slate-700 focus:bg-slate-700 focus:border focus:border-blue-500',
              value: s.name !== undefined ? s.name : `Task ${idx + 1}`,
              onChange: e => updateStep(s.id, { name: e.target.value }),
              onBlur: () => {
                // Auto-save on blur - persist to storage
                try { chrome.storage?.local?.set({ playtest_steps: steps }); } catch {}
              },
              placeholder: `Task ${idx + 1}`
            })
          ),
          React.createElement('div', { className: 'flex items-center gap-2 flex-wrap' },
            React.createElement('input', { type: 'checkbox', checked: !!s.enabled, onChange: e => updateStep(s.id, { enabled: e.target.checked }) }),
            React.createElement('span', { className: 'w-6 h-6 flex items-center justify-center bg-slate-700 border border-slate-600 text-slate-400 rounded text-xs' }, String(idx+1).padStart(2, '0')),
            React.createElement('select', { className: 'bg-slate-700 border border-slate-600 text-slate-100 rounded-lg px-2 py-1.5 min-w-36', value: s.action, onChange: e => updateStep(s.id, { action: e.target.value }) },
              ACTIONS.map(a => React.createElement('option', { key: a.value, value: a.value }, a.label))
            ),
            actionMeta.needsSelector && React.createElement(React.Fragment, null,
              React.createElement('input', { className: 'flex-1 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg px-3 py-1.5 min-w-36', placeholder: 'CSS selector or ${var}', value: s.selector, onChange: e => updateStep(s.id, { selector: e.target.value }) }),
              React.createElement('button', { className: 'bg-slate-700 text-slate-200 border border-slate-600 px-3 py-1.5 rounded-lg text-xs hover:bg-slate-600', onClick: () => pickSelector(s.id) }, 'Pick')
            ),
            actionMeta.needsValue && React.createElement('input', { className: 'flex-1 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg px-3 py-1.5 min-w-36', placeholder: actionMeta.valuePlaceholder || 'value', value: s.value, onChange: e => updateStep(s.id, { value: e.target.value }) }),
            actionMeta.needsPositionPicker && React.createElement('button', { className: 'bg-slate-700 text-slate-200 border border-slate-600 px-3 py-1.5 rounded-lg text-xs hover:bg-slate-600', onClick: () => pickPosition(s.id) }, 'Pick Position')
          ),
          React.createElement('div', { className: 'flex items-center gap-2 flex-wrap' },
            React.createElement('input', { className: 'bg-slate-700 border border-slate-600 text-slate-100 rounded-lg px-2 py-1 text-xs min-w-36', placeholder: 'storeAs (optional)', value: s.storeAs, onChange: e => updateStep(s.id, { storeAs: e.target.value }) }),
            React.createElement('input', { className: 'bg-slate-700 border border-slate-600 text-slate-100 rounded-lg px-2 py-1 text-xs min-w-36', placeholder: 'options JSON (optional)', value: s.optionsText, onChange: e => updateStep(s.id, { optionsText: e.target.value }) }),
            React.createElement('button', { className: 'bg-slate-700 text-slate-200 border border-slate-600 px-2 py-1 rounded text-xs hover:bg-slate-600', title: 'Move up', onClick: () => moveStep(s.id, -1) }, '↑'),
            React.createElement('button', { className: 'bg-slate-700 text-slate-200 border border-slate-600 px-2 py-1 rounded text-xs hover:bg-slate-600', title: 'Move down', onClick: () => moveStep(s.id, +1) }, '↓'),
            React.createElement('button', { className: 'bg-slate-700 text-slate-200 border border-slate-600 px-2 py-1 rounded text-xs hover:bg-slate-600', title: 'Duplicate', onClick: () => duplicateStep(s.id) }, '⎘'),
            React.createElement('button', { className: 'bg-red-800 text-red-200 border border-red-600 px-2 py-1 rounded text-xs hover:bg-red-700', title: 'Delete', onClick: () => deleteStep(s.id) }, '✕'),
            React.createElement('button', { className: 'bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-blue-700', onClick: () => playOne(s), disabled: s.status === 'processing' }, s.status === 'processing' ? 'Running…' : 'Run')
          ),
          React.createElement('div', { className: 'flex items-center gap-2' },
            s.status === 'processing' && React.createElement('span', { className: 'w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin' }),
            s.status === 'ok' && React.createElement('span', { className: 'bg-green-900 text-green-300 px-2 py-1 rounded-full text-xs border border-green-700' }, 'ok'),
            s.status === 'error' && React.createElement('span', { className: 'bg-red-900 text-red-300 px-2 py-1 rounded-full text-xs border border-red-700' }, 'error'),
            s.error && React.createElement('pre', { className: 'text-slate-400 text-xs ml-2', style: { margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }, s.error)
          )
        );
      }),
      showSaveModal && React.createElement('div', { className: 'fixed inset-0 bg-black bg-opacity-70 z-50', onClick: () => setShowSaveModal(false) }),
      showSaveModal && React.createElement('div', { className: 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 max-w-sm w-full mx-4' },
        React.createElement('div', { className: 'bg-slate-800 border border-slate-600 rounded-xl shadow-2xl', onClick: e => e.stopPropagation() },
          React.createElement('div', { className: 'flex items-center justify-between p-5 border-b border-slate-700' },
            React.createElement('h5', { className: 'text-lg font-semibold text-slate-100' }, 'Save Script'),
            React.createElement('button', { type: 'button', className: 'text-slate-400 hover:text-slate-100 text-2xl leading-none p-0 w-6 h-6 flex items-center justify-center', onClick: () => setShowSaveModal(false) }, '×')
          ),
          React.createElement('div', { className: 'p-5' },
            React.createElement('input', { type: 'text', className: 'w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:bg-slate-600 focus:border-blue-500', placeholder: 'Script name', value: saveName, onChange: e => setSaveName(e.target.value), onKeyDown: e => e.key === 'Enter' && confirmSave() })
          ),
          React.createElement('div', { className: 'flex items-center justify-end gap-3 p-5 border-t border-slate-700' },
            React.createElement('button', { type: 'button', className: 'bg-slate-700 text-slate-200 border border-slate-600 px-4 py-2 rounded-lg text-sm hover:bg-slate-600', onClick: () => setShowSaveModal(false) }, 'Cancel'),
            React.createElement('button', { type: 'button', className: 'bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50', onClick: confirmSave, disabled: saving }, saving ? 'Saving...' : 'Save')
          )
        )
      ),
      showLoadModal && React.createElement('div', { className: 'fixed inset-0 bg-black bg-opacity-70 z-50', onClick: () => setShowLoadModal(false) }),
      showLoadModal && React.createElement('div', { className: 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 max-w-sm w-full mx-4' },
        React.createElement('div', { className: 'bg-slate-800 border border-slate-600 rounded-xl shadow-2xl', onClick: e => e.stopPropagation() },
          React.createElement('div', { className: 'flex items-center justify-between p-5 border-b border-slate-700' },
            React.createElement('h5', { className: 'text-lg font-semibold text-slate-100' }, 'Load Script'),
            React.createElement('button', { type: 'button', className: 'text-slate-400 hover:text-slate-100 text-2xl leading-none p-0 w-6 h-6 flex items-center justify-center', onClick: () => setShowLoadModal(false) }, '×')
          ),
          React.createElement('div', { className: 'p-5' },
            (scripts || []).length === 0 ? React.createElement('p', { className: 'text-slate-400' }, 'No scripts saved.') :
            (scripts || []).map(s => React.createElement('button', { key: s.name, className: 'w-full bg-slate-700 text-slate-200 border border-slate-600 px-4 py-2 rounded-lg text-sm hover:bg-slate-600 mb-2', onClick: () => loadScript(s.name) }, s.name))
          ),
          React.createElement('div', { className: 'flex items-center justify-end gap-3 p-5 border-t border-slate-700' },
            React.createElement('button', { type: 'button', className: 'bg-slate-700 text-slate-200 border border-slate-600 px-4 py-2 rounded-lg text-sm hover:bg-slate-600', onClick: () => setShowLoadModal(false) }, 'Cancel')
          )
        )
      )
    );
  }

  function App() {
    const { useEffect, useState } = React;
    const tabId = useTargetTabId();
    const [status, setStatus] = useState('connecting');
    const [lastMsg, setLastMsg] = useState(null);
    const [scriptName, setScriptName] = useState(null);

    useEffect(() => {
      if (!tabId) { setStatus('no-target'); return; }
      sendToTab(tabId, { type: 'get_status' }).then((res) => {
        if (res && res.status) setStatus(res.status);
        else setStatus('unknown');
      });
    }, [tabId]);

    function ping() {
      if (!tabId) return;
      sendToTab(tabId, { type: 'popup_ping' }).then((res) => {
        setLastMsg(res || { ok: false });
        sendToTab(tabId, { type: 'get_status' }).then((s) => {
          if (s && s.status) setStatus(s.status);
        });
      });
    }

    return React.createElement(React.Fragment, null,
      React.createElement(Header, { status, onPing: ping, lastMsg, scriptName }),
      React.createElement('div', { className: 'p-3 mb-5' },
        React.createElement(StepsBuilder, { tabId, onScriptNameChange: setScriptName })
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
