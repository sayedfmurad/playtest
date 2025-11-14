// Initialize shared WebSocket connection (singleton)
if (!window.extensionWS) {
  const ws = new ExtensionWebSocket();
  window.extensionWS = ws;

  window.addEventListener('beforeunload', () => {
    try { window.extensionWS?.close(); } catch {}
  });
}

// Variables store and step execution
(function(){
  const vars = (window._ptVars = window._ptVars || {});

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
    const payload = step.type && !step.action ? step : {
      action: step.action,
      ...(step.target && { target: interpolate(step.target) }),
      ...(step.value !== undefined && { value: interpolate(step.value) }),
      ...(step.options && { options: interpolate(step.options) })
    };
    const res = await window.extensionWS.sendCommand(payload, { timeoutMs: step.timeoutMs });
    if (res?.status === 'ok' && step.storeAs) {
      const det = res.details || {};
      vars[step.storeAs] = det.value !== undefined ? det.value : det.url !== undefined ? det.url : det;
    }
    return res;
  }

  async function runStep(step) {
    const results = [];
    try {
      const lastRes = await execOne(step);
      results.push({ index: 0, step, response: lastRes, uiId: step.uiId });
      // Standardized message format: always include status and error
      const status = lastRes?.status === 'ok' ? 'ok' : 'error';
      const errorMsg = lastRes?.status !== 'ok' ? 
        (lastRes?.error?.message || lastRes?.error || String(lastRes?.error || 'Unknown error')) : '';
      try { 
        chrome.runtime.sendMessage({ 
          type: 'step_result', 
          index: 0, 
          status,
          error: errorMsg,
          uiId: step.uiId 
        }); 
      } catch {}
    } catch (err) {
      results.push({ index: 0, step, error: err, uiId: step.uiId });
      // Standardized message format: always include status and error
      const errorMsg = err?.message || String(err || 'Unknown error');
      try { 
        chrome.runtime.sendMessage({ 
          type: 'step_result', 
          index: 0, 
          status: 'error',
          error: errorMsg,
          uiId: step.uiId 
        }); 
      } catch {}
    }
    return { results };
  }


  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'get_status') {
      const s = window.extensionWS?.ws?.readyState;
      sendResponse({ status: s === 1 ? 'open' : s === 0 ? 'connecting' : 'closed' });
      return true;
    }

    if (msg.type === 'run_steps' && (msg.step || Array.isArray(msg.steps))) {
      // Accept single-step messages (preferred). If an array is provided, run the first step for backward compatibility.
      const step = msg.step || (Array.isArray(msg.steps) ? msg.steps[0] : null);
      if (!step) { sendResponse({ ok: false, error: 'No step provided' }); return true; }
      runStep(step).then(r => sendResponse(r)).catch(e => sendResponse({ ok: false, error: String(e) }));
      return true;
    }

    if (msg.type === 'send_command' && msg.payload) {
      window.extensionWS.sendCommand(msg.payload, msg.options)
        .then(r => sendResponse({ ok: true, response: r }))
        .catch(e => sendResponse({ ok: false, error: e }));
      return true;
    }
  });
})();

// Element and position picker
(function(){
  if (window._ptPickerInit) return;
  window._ptPickerInit = true;

  let picking = false, pickingPosition = false, hoverEl = null, styleEl = null, resolvePick = null, positionOverlay = null;

  function ensureStyle() {
    if (styleEl) return;
    styleEl = document.createElement('style');
    styleEl.textContent = `
      .__pt_pick_highlight__ { outline: 2px solid #3b82f6 !important; cursor: crosshair !important; }
      body.__pt_picking__ * { cursor: crosshair !important; }
      body.__pt_picking__ select, body.__pt_picking__ option { cursor: pointer !important; }
      .__pt_position_overlay__ {
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(59, 130, 246, 0.1); cursor: crosshair; z-index: 2147483647; pointer-events: auto;
      }
      .__pt_position_indicator__ {
        position: fixed; width: 40px; height: 40px; border: 2px solid #3b82f6; border-radius: 50%;
        background: rgba(59, 130, 246, 0.2); pointer-events: none; transform: translate(-50%, -50%);
        z-index: 2147483648; display: flex; align-items: center; justify-content: center;
        font-size: 10px; color: #1e40af; font-weight: bold;
      }
      .__pt_position_coords__ {
        position: fixed; background: #1e40af; color: white; padding: 4px 8px; border-radius: 4px;
        font-size: 12px; pointer-events: none; z-index: 2147483649; font-family: monospace;
      }
    `;
    document.documentElement.appendChild(styleEl);
  }

  function bestSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    const attrs = ['data-testid', 'data-test', 'data-qa', 'data-cy', 'aria-label'];
    for (const a of attrs) {
      const v = el.getAttribute(a);
      if (v) {
        const sel = `[${a}="${CSS.escape(v)}"]`;
        if (document.querySelectorAll(sel).length === 1) return sel;
      }
    }
    if (el.id) {
      const sel = `#${CSS.escape(el.id)}`;
      if (document.querySelectorAll(sel).length === 1) return sel;
    }
    const classes = Array.from(el.classList || []).filter(c => c !== '__pt_pick_highlight__').slice(0, 2).map(c => `.${CSS.escape(c)}`).join('');
    const tag = el.tagName.toLowerCase();
    let candidate = `${tag}${classes}`;
    if (candidate && document.querySelectorAll(candidate).length === 1) return candidate;
    const parts = [];
    let node = el;
    for (let depth = 0; depth < 4 && node && node.nodeType === 1; depth++) {
      let part = node.tagName.toLowerCase();
      if (node.id) { part += `#${CSS.escape(node.id)}`; parts.unshift(part); break; }
      const cls = Array.from(node.classList || []).filter(c => c !== '__pt_pick_highlight__').slice(0, 1).map(c => `.${CSS.escape(c)}`).join('');
      parts.unshift(part + cls);
      node = node.parentElement;
    }
    return parts.join(' > ') || tag;
  }

  function stopPicker(send, result) {
    picking = pickingPosition = false;
    document.body.classList.remove('__pt_picking__');
    if (hoverEl) hoverEl.classList.remove('__pt_pick_highlight__');
    hoverEl = null;
    if (positionOverlay) { positionOverlay.remove(); positionOverlay = null; }
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKey, true);
    if (styleEl) { try { styleEl.remove(); } catch {} styleEl = null; }
    const r = result || { ok: false, error: 'cancelled' };
    try { send(r); } catch {}
    if (resolvePick) { try { resolvePick(r); } catch {} resolvePick = null; }
  }

  function onMove(e) {
    if (!picking) return;
    const el = e.target;
    if (hoverEl !== el) {
      if (hoverEl) hoverEl.classList.remove('__pt_pick_highlight__');
      hoverEl = el;
      if (hoverEl) hoverEl.classList.add('__pt_pick_highlight__');
    }
  }

  function onClick(e) {
    if (!picking) return;
    e.preventDefault();
    e.stopPropagation();
    stopPicker(() => {}, { ok: true, selector: bestSelector(e.target) });
  }

  function onKey(e) {
    if (e.key === 'Escape' && (picking || pickingPosition)) {
      e.preventDefault();
      e.stopPropagation();
      stopPicker(() => {}, { ok: false, error: 'cancelled' });
    }
  }

  function onPositionMove(e) {
    if (!pickingPosition || !positionOverlay) return;
    let indicator = positionOverlay.querySelector('.__pt_position_indicator__');
    let coords = positionOverlay.querySelector('.__pt_position_coords__');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = '__pt_position_indicator__';
      indicator.textContent = '+';
      positionOverlay.appendChild(indicator);
    }
    if (!coords) {
      coords = document.createElement('div');
      coords.className = '__pt_position_coords__';
      positionOverlay.appendChild(coords);
    }
    const pageX = e.clientX + window.scrollX;
    const pageY = e.clientY + window.scrollY;
    indicator.style.left = e.clientX + 'px';
    indicator.style.top = e.clientY + 'px';
    coords.textContent = `X: ${pageX}, Y: ${pageY}`;
    coords.style.left = (e.clientX + 25) + 'px';
    coords.style.top = (e.clientY - 25) + 'px';
  }

  function onPositionClick(e) {
    if (!pickingPosition) return;
    e.preventDefault();
    e.stopPropagation();
    stopPicker(() => {}, { ok: true, position: { x: e.clientX + window.scrollX, y: e.clientY + window.scrollY } });
  }

  function startPicker(sendResponse) {
    if (picking || pickingPosition) return;
    ensureStyle();
    picking = true;
    pickingPosition = false;
    document.body.classList.add('__pt_picking__');
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey, true);
    resolvePick = (res) => sendResponse(res);
  }

  function startPositionPicker(sendResponse) {
    if (picking || pickingPosition) return;
    ensureStyle();
    pickingPosition = true;
    picking = false;
    positionOverlay = document.createElement('div');
    positionOverlay.className = '__pt_position_overlay__';
    document.body.appendChild(positionOverlay);
    positionOverlay.addEventListener('mousemove', onPositionMove, true);
    positionOverlay.addEventListener('click', onPositionClick, true);
    window.addEventListener('keydown', onKey, true);
    resolvePick = (res) => sendResponse(res);
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'start_picker') {
      startPicker(sendResponse);
      return true;
    }
    if (msg.type === 'start_position_picker') {
      startPositionPicker(sendResponse);
      return true;
    }
    if (msg.type === 'stop_picker') {
      stopPicker(sendResponse, { ok: false, error: 'stopped' });
      return true;
    }
  });
})();


