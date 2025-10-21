// Initialize shared WebSocket connection (singleton)
if (!window.extensionWS) {
  const ws = new ExtensionWebSocket();
  window.extensionWS = ws;

  // Keep-alive ping every 30 seconds
  window._extensionWSKeepAlive = setInterval(() => {
    try {
      window.extensionWS?.sendPing().catch(() => {});
    } catch (e) {
      console.warn('[EXT] Ping failed:', e);
    }
  }, 30000);

  window.addEventListener('beforeunload', () => {
    try { clearInterval(window._extensionWSKeepAlive); } catch {}
    try { window.extensionWS?.close(); } catch {}
  });
}

// Simple variables store and utilities for scripting
(function(){
  const vars = (window._ptVars = window._ptVars || {});
  const stepStates = (window._ptStepStates = window._ptStepStates || {}); // uiId -> {status, error}

  function saveStates() {
    try { chrome.storage?.local?.set({ playtest_step_states: stepStates }); } catch {}
  }

  function interpolate(value) {
    if (typeof value === 'string') {
      return value.replace(/\$\{([^}]+)\}/g, (_, k) => {
        const v = vars[k.trim()];
        return v === undefined || v === null ? '' : String(v);
      });
    }
    if (Array.isArray(value)) return value.map(interpolate);
    if (value && typeof value === 'object') {
      const out = {};
      for (const k in value) out[k] = interpolate(value[k]);
      return out;
    }
    return value;
  }

  async function execOne(step) {
    const payload = {};
    if (step.type && !step.action) {
      // Allow {type:'ping'} style
      Object.assign(payload, step);
    } else {
      payload.action = step.action;
      if (step.target) payload.target = interpolate(step.target);
      if (step.value !== undefined) payload.value = interpolate(step.value);
      if (step.options) payload.options = interpolate(step.options);
    }
    const res = await window.extensionWS.sendCommand(payload, { timeoutMs: step.timeoutMs });
    // Store vars on success
    if (res && res.status === 'ok' && step.storeAs) {
      const det = res.details || {};
      const val = det.value !== undefined ? det.value : det.url !== undefined ? det.url : det;
      vars[step.storeAs] = val;
    }
    return res;
  }

  async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function runSteps(steps, opts = {}) {
    const maxIterations = typeof opts.maxIterations === 'number' ? opts.maxIterations : 10000;
    const results = [];
    let i = 0, iterations = 0;
    while (i < steps.length) {
      if (iterations++ > maxIterations) throw new Error('Max iterations exceeded');
      const step = steps[i];

      let attempts = 0;
      const retries = Number(step.retries || 0);
      const retryDelay = Number(step.retryDelayMs || 500);
      let lastRes = null;

      while (true) {
        try {
          lastRes = await execOne(step);
          results.push({ index: i, step, response: lastRes, uiId: step.uiId });
          // Broadcast per-step update (optional)
          try { chrome.runtime.sendMessage({ type: 'step_result', index: i, response: lastRes, uiId: step.uiId }); } catch {}
          // persist state
          if (step.uiId) {
            stepStates[step.uiId] = { status: 'ok', error: '' };
            saveStates();
          }
          break;
        } catch (err) {
          attempts++;
          results.push({ index: i, step, error: err, uiId: step.uiId });
          try { chrome.runtime.sendMessage({ type: 'step_result', index: i, error: err, uiId: step.uiId }); } catch {}
          if (step.uiId) {
            const msg = (err && (err.message || String(err))) || 'Unknown error';
            stepStates[step.uiId] = { status: 'error', error: msg };
            saveStates();
          }
          if (attempts <= retries) {
            await sleep(retryDelay);
            continue;
          } else {
            lastRes = err;
            break;
          }
        }
      }

      // Control flow: nextOnOk / nextOnError, else sequential
      if (lastRes && lastRes.status === 'ok' && step.nextOnOk !== undefined) {
        i = step.nextOnOk;
      } else if (lastRes && lastRes.status === 'error' && step.nextOnError !== undefined) {
        i = step.nextOnError;
      } else {
        i++;
      }
    }
    return { ok: true, results, vars };
  }

  // Expose API on window and via runtime messaging
  window.playtest = {
    vars,
    interpolate,
    runSteps,
    send: (payload, opts) => window.extensionWS.sendCommand(payload, opts),
  };

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

      if (msg.type === 'run_steps' && Array.isArray(msg.steps)) {
        runSteps(msg.steps, msg.options || {})
          .then((r) => sendResponse(r))
          .catch((e) => sendResponse({ ok: false, error: String(e) }));
        return true; // async
      }

      if (msg.type === 'send_command' && msg.payload) {
        window.extensionWS
          .sendCommand(msg.payload, msg.options)
          .then((r) => sendResponse({ ok: true, response: r }))
          .catch((e) => sendResponse({ ok: false, error: e }));
        return true; // async
      }

      if (msg.type === 'get_step_states') {
        sendResponse({ ok: true, states: stepStates });
        return true;
      }
    });
  } catch (e) {
    console.warn('[EXT] runtime messaging unavailable:', e);
  }
})();

// Expose a simple element picker for building selectors
(function(){
  if (window._ptPickerInit) return; // singleton
  window._ptPickerInit = true;

  let picking = false;
  let hoverEl = null;
  let styleEl = null;
  let resolvePick = null;

  function ensureStyle() {
    if (styleEl) return;
    styleEl = document.createElement('style');
    styleEl.textContent = `
      .__pt_pick_highlight__ { 
        outline: 2px solid #3b82f6 !important; 
        cursor: crosshair !important; 
      }
      body.__pt_picking__ * { 
        cursor: crosshair !important; 
      }
      body.__pt_picking__ select,
      body.__pt_picking__ option {
        cursor: pointer !important;
      }
    `;
    document.documentElement.appendChild(styleEl);
  }

  function bestSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    // Prefer robust attributes
    const attrs = ['data-testid', 'data-test', 'data-qa', 'data-cy', 'aria-label'];
    for (const a of attrs) {
      const v = el.getAttribute(a);
      if (v) {
        const sel = `[${a}="${CSS.escape(v)}"]`;
        if (document.querySelectorAll(sel).length === 1) return sel;
      }
    }
    // Prefer id if unique
    const id = el.id;
    if (id) {
      const sel = `#${CSS.escape(id)}`;
      if (document.querySelectorAll(sel).length === 1) return sel;
    }
    // Build a class-based selector limited to first two classes
    const classes = Array.from(el.classList || []).slice(0, 2).map(c => `.${CSS.escape(c)}`).join('');
    const tag = el.tagName.toLowerCase();
    let candidate = `${tag}${classes}`;
    if (candidate && document.querySelectorAll(candidate).length === 1) return candidate;

    // Walk up to create a short path
    const parts = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 4) {
      let part = node.tagName.toLowerCase();
      if (node.id) { part += `#${CSS.escape(node.id)}`; parts.unshift(part); break; }
      const cls = Array.from(node.classList || []).slice(0, 1).map(c => `.${CSS.escape(c)}`).join('');
      part += cls;
      parts.unshift(part);
      node = node.parentElement;
      depth++;
    }
    candidate = parts.join(' > ');
    return candidate || tag;
  }

  function clearHighlight() {
    if (hoverEl) hoverEl.classList.remove('__pt_pick_highlight__');
    hoverEl = null;
  }

  function onMove(e) {
    if (!picking) return;
    const el = e.target;
    if (hoverEl !== el) {
      clearHighlight();
      hoverEl = el;
      if (hoverEl) hoverEl.classList.add('__pt_pick_highlight__');
    }
  }

  function stopPicker(send, result) {
    picking = false;
    document.body.classList.remove('__pt_picking__');
    clearHighlight();
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKey, true);
    try { if (styleEl) styleEl.remove(); } catch {}
    styleEl = null;
    const r = result || { ok: false, error: 'cancelled' };
    try { send(r); } catch {}
    if (resolvePick) { try { resolvePick(r); } catch {} resolvePick = null; }
  }

  function onClick(e) {
    if (!picking) return;
    // Don't interfere with select dropdowns
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const el = e.target;
    const selector = bestSelector(el);
    const result = { ok: true, selector };
    stopPicker(() => {}, result);
  }

  function onKey(e) {
    if (!picking) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      stopPicker(() => {}, { ok: false, error: 'cancelled' });
    }
  }

  function startPicker(sendResponse) {
    if (picking) return; // already
    ensureStyle();
    picking = true;
    document.body.classList.add('__pt_picking__');
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey, true);
    // Store resolver so we can reply later
    resolvePick = (res) => sendResponse(res);
  }

  // Extend runtime messaging
  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'start_picker') {
        startPicker(sendResponse);
        return true; // async
      }
      if (msg.type === 'stop_picker') {
        stopPicker(sendResponse, { ok: false, error: 'stopped' });
        return true;
      }
    });
  } catch {}
})();
