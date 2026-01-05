chrome.runtime.onInstalled.addListener(() => {
  console.log('TUI Navigator installed.');
  // Initialize storage with default values
  chrome.storage.local.get(['totalActions'], (result) => {
    // Only set if not already present to avoid wiping data on updates
    if (result.totalActions === undefined) {
      chrome.storage.local.set({
        totalActions: 0,
        siteSpecificUsage: {},
        sessionUptime: 0
      });
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'METRIC_EVENT') {
    handleMetricEvent(message.payload);
  } else if (message.type === 'STATUS_UPDATE') {
    // Can be used to update badge or temporary state
    console.log('Status update from tab:', sender.tab.id, message.payload);
    if (message.payload.supported) {
      chrome.action.setBadgeText({ text: 'ON', tabId: sender.tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#4caf50', tabId: sender.tab.id });
    } else {
      chrome.action.setBadgeText({ text: '', tabId: sender.tab.id });
    }
  }
});

function handleMetricEvent(payload) {
  chrome.storage.local.get(['totalActions'], (result) => {
    let current = result.totalActions || 0;
    chrome.storage.local.set({ totalActions: current + 1 });
  });
}
