chrome.runtime.onInstalled.addListener(() => {
  console.log('TUI Navigator installed.');
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });

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
    // Update badge based on support AND enabled state
    if (sender.tab) {
      updateBadge(sender.tab.id, message.payload);
    }
  }
});

// Sync on Navigation (Backup for when content script doesn't re-run)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    chrome.tabs.sendMessage(tabId, { type: 'GET_STATUS' }, (response) => {
      // Ignore errors (content script might not be injected yet on restricted pages)
      if (!chrome.runtime.lastError && response) {
        updateBadge(tabId, response);
      } else {
        // Clear badge if no script response (likely navigating to unsupported/restricted page)
        chrome.action.setBadgeText({ text: '', tabId: tabId });
      }
    });
  }
});

// In-memory cache to prevent race conditions
let localTotal = 0;
let isInitialized = false;

// Initialize cache
chrome.storage.local.get(['totalActions'], (result) => {
  localTotal = result.totalActions || 0;
  isInitialized = true;
});

function updateBadge(tabId, state) {
  if (state.supported && state.enabled) {
    chrome.action.setBadgeText({ text: 'ON', tabId: tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#4caf50', tabId: tabId });
  } else {
    chrome.action.setBadgeText({ text: '', tabId: tabId });
  }
}

function handleMetricEvent(payload) {
  if (isInitialized) {
    localTotal++;
    chrome.storage.local.set({ totalActions: localTotal });
  } else {
    // Fallback if event comes before init finishes (rare but possible)
    chrome.storage.local.get(['totalActions'], (result) => {
      localTotal = (result.totalActions || 0) + 1;
      isInitialized = true;
      chrome.storage.local.set({ totalActions: localTotal });
    });
  }
}
