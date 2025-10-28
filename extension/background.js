// Open a separate regular window (not the browser-action popup) when the user clicks the toolbar icon.
// This opens popup.html in a dedicated normal window.

chrome.action.onClicked.addListener(async (tab) => {
  const url = chrome.runtime.getURL('popup.html');
  await chrome.windows.create({
    url,
    type: 'normal',
    width: 1200,
    height: 500,
    focused: true
  });
});
