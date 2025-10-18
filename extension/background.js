// Open a separate regular window (not the browser-action popup) when the user clicks the toolbar icon.
// This opens popup.html in a dedicated normal window.

chrome.action.onClicked.addListener(async (tab) => {
  const url = chrome.runtime.getURL('popup.html');
  // Persist the originating tab as the target content tab
  try {
    if (tab && tab.id) {
      await chrome.storage.local.set({ playtest_targetTabId: tab.id, playtest_targetWindowId: tab.windowId });
    }
  } catch {}

  // Focus previously opened editor window if it exists
  const existing = await chrome.storage.local.get(['playtest_windowId']);
  if (existing && existing.playtest_windowId) {
    try {
      const win = await chrome.windows.get(existing.playtest_windowId, { populate: false });
      if (win) {
        await chrome.windows.update(win.id, { focused: true });
        return;
      }
    } catch {}
  }

  const win = await chrome.windows.create({
    url,
    type: 'normal',
    width: 1200,
    height: 900,
    focused: true
  });
  if (win && win.id) {
    await chrome.storage.local.set({ playtest_windowId: win.id });
  }
});

// Cleanup windowId on removal
chrome.windows.onRemoved.addListener(async (windowId) => {
  const existing = await chrome.storage.local.get(['playtest_windowId']);
  if (existing && existing.playtest_windowId === windowId) {
    await chrome.storage.local.remove('playtest_windowId');
  }
});
