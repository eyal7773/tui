document.addEventListener('DOMContentLoaded', () => {
    // Tab switching
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
        });
    });

    // Config Tab Handler
    const configTabBtn = document.querySelector('.tab-btn[data-tab="config"]');
    if (configTabBtn) {
        configTabBtn.addEventListener('click', () => loadConfig());
    }

    // Save & Reset Config Handlers
    document.getElementById('save-config').addEventListener('click', saveConfig);
    document.getElementById('reset-config').addEventListener('click', resetConfig);

    // Initial Data Load
    refreshState();

    // Toggle listener (User Action)
    const toggle = document.getElementById('site-toggle');
    toggle.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        chrome.storage.local.set({ tuiEnabled: isEnabled });

        // Notify active tab immediately
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'TOGGLE_STATE',
                    payload: { enabled: isEnabled }
                });
                // Optimistic UI update
                updateStatusBadge(isEnabled, document.getElementById('current-site').textContent !== 'Not Supported');
            }
        });
    });

    // Admin Mode Easter Egg
    const versionEl = document.getElementById('app-version');
    let versionClickCount = 0;
    let versionClickTimer = null;

    versionEl.addEventListener('click', () => {
        versionClickCount++;
        clearTimeout(versionClickTimer);

        // Reset count if valid pause
        versionClickTimer = setTimeout(() => {
            versionClickCount = 0;
        }, 2000);

        if (versionClickCount === 10) {
            versionClickCount = 0;
            // Toggle Admin Mode
            chrome.storage.session.get(['tuiAdminMode'], (result) => {
                const newState = !result.tuiAdminMode;
                chrome.storage.session.set({ tuiAdminMode: newState });
                // Visual / Haptic feedback could go here, but UI update in onChanged handles it
            });
        }
    });

    // Listen for storage changes (Live Metrics & External Toggles)
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            if (changes.totalActions) {
                document.getElementById('total-actions').textContent = changes.totalActions.newValue;
            }
            if (changes.tuiEnabled) {
                const isEnabled = changes.tuiEnabled.newValue !== false;
                document.getElementById('site-toggle').checked = isEnabled;
                // We'll let refreshState or user interaction handle badge, 
                // but checking here ensures sync if changed elsewhere
            }
        }
        if (namespace === 'session') {
            if (changes.tuiAdminMode) {
                updateAdminInterface(changes.tuiAdminMode.newValue);
            }
        }
    });
});

function refreshState() {
    // 1. Load Storage (Metrics, Enabled)
    chrome.storage.local.get(['totalActions', 'tuiEnabled'], (result) => {
        if (result.totalActions !== undefined) {
            document.getElementById('total-actions').textContent = result.totalActions;
        }
        // Set toggle initial state
        const isEnabled = result.tuiEnabled !== false; // Default true
        document.getElementById('site-toggle').checked = isEnabled;
    });

    // 1.5 Load Admin from Session
    chrome.storage.session.get(['tuiAdminMode'], (result) => {
        updateAdminInterface(result.tuiAdminMode || false);
    });

    // 2. Load Engine Status (The Truth)
    const siteEl = document.getElementById('current-site');
    const elementsEl = document.getElementById('elements-found');
    const statusBadg = document.getElementById('status-indicator');

    siteEl.textContent = 'Detecting...';

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) {
            siteEl.textContent = 'No Active Tab';
            return;
        }

        // Set a timeout to handle unresponsive content scripts
        let responded = false;
        const timeoutId = setTimeout(() => {
            if (!responded) {
                siteEl.textContent = 'Connection Timeout';
                elementsEl.textContent = '-';
                statusBadg.className = 'status-badge offline';
                statusBadg.textContent = 'Offline';
            }
        }, 1000);

        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_STATUS' }, (response) => {
            responded = true;
            clearTimeout(timeoutId);

            if (chrome.runtime.lastError || !response) {
                siteEl.textContent = 'Not Supported';
                elementsEl.textContent = '-';
                updateStatusBadge(false, false);
                return;
            }

            // Update UI with real engine state
            if (response.supported) {
                siteEl.textContent = response.siteName || 'Supported Site';
                siteEl.style.color = '#4caf50';
                elementsEl.textContent = response.elementCount || '0';

                // Badge depends on BOTH enabled state and support
                updateStatusBadge(response.enabled, true);

                // Also update toggle to match engine truth if needed
                document.getElementById('site-toggle').checked = response.enabled;
            } else {
                siteEl.textContent = 'Not Supported';
                siteEl.style.color = '#f44336';
                elementsEl.textContent = '0';
                updateStatusBadge(false, false);
            }
        });
    });

    // Version
    VersionManager.displayVersion('app-version');
}

function updateAdminInterface(isAdmin) {
    const configBtn = document.querySelector('.tab-btn[data-tab="config"]');
    if (configBtn) {
        configBtn.style.display = isAdmin ? 'block' : 'none';

        // If we are currently ON the config tab and it gets hidden, switch to status
        if (!isAdmin && configBtn.classList.contains('active')) {
            document.querySelector('.tab-btn[data-tab="status"]').click();
        }
    }
}

function updateStatusBadge(isEnabled, isSupported) {
    const indicator = document.getElementById('status-indicator');
    const label = document.getElementById('toggle-label'); // "Enable TUI" text

    if (isSupported && isEnabled) {
        indicator.textContent = 'Active';
        indicator.className = 'status-badge online';
        label.textContent = 'Enabled';
    } else if (isSupported && !isEnabled) {
        indicator.textContent = 'Disabled';
        indicator.className = 'status-badge offline';
        label.textContent = 'Disabled'; // Toggle label
    } else {
        indicator.textContent = 'Inactive';
        indicator.className = 'status-badge offline';
        label.textContent = 'Enable TUI';
    }
}

function loadConfig() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return;
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_STRATEGY' }, (response) => {
            const editor = document.getElementById('config-editor');
            if (chrome.runtime.lastError || !response) {
                editor.value = '// Error connecting to page or TUI not active.\n// Try reloading the page.';
                return;
            }
            editor.value = JSON.stringify(response, null, 2);
        });
    });
}

function saveConfig() {
    const editor = document.getElementById('config-editor');
    const statusEl = document.getElementById('config-status');
    const resetStatus = () => setTimeout(() => { statusEl.textContent = ''; statusEl.className = ''; }, 3000);

    try {
        const config = JSON.parse(editor.value);
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;
            chrome.tabs.sendMessage(tabs[0].id, {
                type: 'UPDATE_STRATEGY',
                payload: config
            }, (response) => {
                if (response && response.success) {
                    statusEl.textContent = 'Saved & Reloaded!';
                    statusEl.className = 'success';
                    refreshState(); // Refresh stats
                } else {
                    statusEl.textContent = 'Failed to update page.';
                    statusEl.className = 'error';
                }
                resetStatus();
            });
        });
    } catch (e) {
        statusEl.textContent = 'Invalid JSON: ' + e.message;
        statusEl.className = 'error';
    }
}

function resetConfig() {
    const statusEl = document.getElementById('config-status');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return;
        chrome.tabs.sendMessage(tabs[0].id, { type: 'RESET_STRATEGY' }, (response) => {
            if (response && response.success) {
                statusEl.textContent = 'Restored Defaults!';
                statusEl.className = 'success';
                loadConfig();
                refreshState();
            } else {
                statusEl.textContent = 'Failed to reset.';
                statusEl.className = 'error';
            }
            setTimeout(() => { statusEl.textContent = ''; statusEl.className = ''; }, 3000);
        });
    });
}
