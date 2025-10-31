function blankStep(index = 0) {
  return {
    id: `${Date.now()}`,
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

function sendToTab(msg) {
  return new Promise((resolve) => {
    try {
      // Find the active tab in any normal window (excluding extension pages)
      chrome.tabs.query({ active: true, windowType: 'normal' }, (tabs) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        chrome.tabs.sendMessage(tabs[0].id, msg, (res) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(res);
          }
        });
      });
    } catch (e) {
      resolve({ ok: false, error: String(e) });
    }
  });
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

