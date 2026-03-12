chrome.runtime.onInstalled.addListener(() => {
  console.log('TUI Navigator installed.');
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
  initStorage();
});

// Also init on service worker startup (after browser restart)
chrome.runtime.onStartup.addListener(() => {
  initStorage();
});

function initStorage() {
  chrome.storage.local.get(null, (result) => {
    const defaults = {
      totalActions: 0,
      pagesOpened: 0,
      keyBreakdown: { ArrowUp: 0, ArrowDown: 0, ArrowLeft: 0, ArrowRight: 0 },
      dailyActions: {},
      firstUseDate: null,
      sessionCount: 0,
      keySequences: {},
      hourlyActivity: {},
      weekdayActivity: {}
    };
    const missing = {};
    for (const [key, val] of Object.entries(defaults)) {
      if (result[key] === undefined) missing[key] = val;
    }
    if (Object.keys(missing).length > 0) {
      chrome.storage.local.set(missing);
    }
    // Sync in-memory cache from storage
    localCache.totalActions = result.totalActions ?? defaults.totalActions;
    localCache.pagesOpened = result.pagesOpened ?? defaults.pagesOpened;
    localCache.keyBreakdown = result.keyBreakdown ?? { ...defaults.keyBreakdown };
    localCache.dailyActions = result.dailyActions ?? {};
    localCache.firstUseDate = result.firstUseDate ?? null;
    localCache.sessionCount = result.sessionCount ?? 0;
    localCache.keySequences = result.keySequences ?? {};
    localCache.hourlyActivity = result.hourlyActivity ?? {};
    localCache.weekdayActivity = result.weekdayActivity ?? {};
    isInitialized = true;
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'METRIC_EVENT') {
    handleMetricEvent(message.payload);
  } else if (message.type === 'STATUS_UPDATE') {
    if (sender.tab) {
      updateBadge(sender.tab.id, message.payload);
    }
    // Count sessions: each STATUS_UPDATE from a content script is a new page load
    if (isInitialized) {
      localCache.sessionCount++;
      chrome.storage.local.set({ sessionCount: localCache.sessionCount });
    }
  }
});

// Sync on Navigation (Backup for when content script doesn't re-run)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    chrome.tabs.sendMessage(tabId, { type: 'GET_STATUS' }, (response) => {
      if (!chrome.runtime.lastError && response) {
        updateBadge(tabId, response);
      } else {
        chrome.action.setBadgeText({ text: '', tabId: tabId }).catch(() => {});
      }
    });
  }
});

// In-memory cache
const localCache = {
  totalActions: 0,
  pagesOpened: 0,
  keyBreakdown: { ArrowUp: 0, ArrowDown: 0, ArrowLeft: 0, ArrowRight: 0 },
  dailyActions: {},
  firstUseDate: null,
  sessionCount: 0,
  keySequences: {},
  hourlyActivity: {},
  weekdayActivity: {}
};
let isInitialized = false;

// Rolling 2-key buffer for 3-key sequence tracking
let lastTwoKeys = [];

// Initialize cache on service worker load
chrome.storage.local.get(null, (result) => {
  localCache.totalActions = result.totalActions ?? 0;
  localCache.pagesOpened = result.pagesOpened ?? 0;
  localCache.keyBreakdown = result.keyBreakdown ?? { ArrowUp: 0, ArrowDown: 0, ArrowLeft: 0, ArrowRight: 0 };
  localCache.dailyActions = result.dailyActions ?? {};
  localCache.firstUseDate = result.firstUseDate ?? null;
  localCache.sessionCount = result.sessionCount ?? 0;
  localCache.keySequences = result.keySequences ?? {};
  localCache.hourlyActivity = result.hourlyActivity ?? {};
  localCache.weekdayActivity = result.weekdayActivity ?? {};
  isInitialized = true;
});

function updateBadge(tabId, state) {
  if (state.supported && state.enabled) {
    chrome.action.setBadgeText({ text: 'ON', tabId: tabId }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ color: '#4caf50', tabId: tabId }).catch(() => {});
  } else {
    chrome.action.setBadgeText({ text: '', tabId: tabId }).catch(() => {});
  }
}

const KEY_CODE_MAP = {
  ArrowDown: 'D',
  ArrowUp: 'U',
  ArrowLeft: 'L',
  ArrowRight: 'R',
  Enter: 'E'
};

function handleMetricEvent(payload) {
  if (!isInitialized) {
    // Retry once init completes
    chrome.storage.local.get(null, (result) => {
      localCache.totalActions = result.totalActions ?? 0;
      localCache.pagesOpened = result.pagesOpened ?? 0;
      localCache.keyBreakdown = result.keyBreakdown ?? { ArrowUp: 0, ArrowDown: 0, ArrowLeft: 0, ArrowRight: 0 };
      localCache.dailyActions = result.dailyActions ?? {};
      localCache.firstUseDate = result.firstUseDate ?? null;
      localCache.sessionCount = result.sessionCount ?? 0;
      localCache.keySequences = result.keySequences ?? {};
      localCache.hourlyActivity = result.hourlyActivity ?? {};
      localCache.weekdayActivity = result.weekdayActivity ?? {};
      isInitialized = true;
      handleMetricEvent(payload);
    });
    return;
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const currentHour = String(now.getHours());
  const currentDow = String(now.getDay()); // 0=Sun, 6=Sat

  // Total actions
  localCache.totalActions++;

  // First use date
  if (!localCache.firstUseDate) {
    localCache.firstUseDate = today;
  }

  // Key-specific metrics
  if (payload.action === 'NAVIGATE' && localCache.keyBreakdown[payload.key] !== undefined) {
    localCache.keyBreakdown[payload.key]++;
  }
  if (payload.action === 'ENTER') {
    localCache.pagesOpened++;
  }

  // Daily activity + prune to 30 days
  localCache.dailyActions[today] = (localCache.dailyActions[today] || 0) + 1;
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  for (const dateKey of Object.keys(localCache.dailyActions)) {
    if (new Date(dateKey) < thirtyDaysAgo) {
      delete localCache.dailyActions[dateKey];
    }
  }

  // Hourly activity
  localCache.hourlyActivity[currentHour] = (localCache.hourlyActivity[currentHour] || 0) + 1;

  // Weekday activity
  localCache.weekdayActivity[currentDow] = (localCache.weekdayActivity[currentDow] || 0) + 1;

  // Sequence tracking (3-key sequences)
  const keyCode = KEY_CODE_MAP[payload.key];
  if (keyCode) {
    if (lastTwoKeys.length === 2) {
      const seq = lastTwoKeys[0] + lastTwoKeys[1] + keyCode;
      localCache.keySequences[seq] = (localCache.keySequences[seq] || 0) + 1;

      // Prune to top 50 entries
      const entries = Object.entries(localCache.keySequences);
      if (entries.length > 50) {
        entries.sort((a, b) => b[1] - a[1]);
        localCache.keySequences = Object.fromEntries(entries.slice(0, 50));
      }
    }
    lastTwoKeys.push(keyCode);
    if (lastTwoKeys.length > 2) lastTwoKeys.shift();
  }

  // Batch write all fields
  chrome.storage.local.set({
    totalActions: localCache.totalActions,
    pagesOpened: localCache.pagesOpened,
    keyBreakdown: localCache.keyBreakdown,
    dailyActions: localCache.dailyActions,
    firstUseDate: localCache.firstUseDate,
    keySequences: localCache.keySequences,
    hourlyActivity: localCache.hourlyActivity,
    weekdayActivity: localCache.weekdayActivity
  });
}
