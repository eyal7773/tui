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
        configTabBtn.addEventListener('click', () => {
            loadConfig();
        });
    }

    // Save Config Handler
    document.getElementById('save-config').addEventListener('click', saveConfig);

    // Load initial stats
    updateStats();

    // Toggle listener
    const toggle = document.getElementById('site-toggle');

    // Load saved state for toggle
    chrome.storage.local.get(['tuiEnabled'], (result) => {
        // Default to true if not set
        const isEnabled = result.tuiEnabled !== false;
        toggle.checked = isEnabled;
        updateStatusIndicator(isEnabled);
    });

    toggle.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        chrome.storage.local.set({ tuiEnabled: isEnabled });
        updateStatusIndicator(isEnabled);

        // Notify active tab to update state immediately
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'TOGGLE_STATE',
                    payload: { enabled: isEnabled }
                });
            }
        });
    });
});

function updateStatusIndicator(isEnabled) {
    const indicator = document.getElementById('status-indicator');
    const label = document.getElementById('toggle-label');
    if (isEnabled) {
        indicator.textContent = 'Active';
        indicator.className = 'status-badge online';
        label.textContent = 'Enabled';
    } else {
        indicator.textContent = 'Inactive';
        indicator.className = 'status-badge offline';
        label.textContent = 'Disabled';
    }
}

function updateStats() {
    chrome.storage.local.get(['totalActions'], (result) => {
        if (result.totalActions !== undefined) {
            document.getElementById('total-actions').textContent = result.totalActions;
        }
    });

    // Get active tab info for site detection
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            // We can check if the site is supported by asking the content script
            // or simply checking the URL matches in the popup (lighter weight)
            // But let's ask the content script for accurate status
            chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_STATUS' }, (response) => {
                const siteEl = document.getElementById('current-site');
                const elementsEl = document.getElementById('elements-found');

                if (chrome.runtime.lastError || !response) {
                    siteEl.textContent = 'Not Supported / Error';
                    elementsEl.textContent = '-';
                    return;
                }

                if (response.supported) {
                    siteEl.textContent = response.siteName || 'Supported Site';
                    siteEl.style.color = '#4caf50';
                    elementsEl.textContent = response.elementCount || '0';
                } else {
                    siteEl.textContent = 'Not Supported';
                    siteEl.style.color = '#f44336';
                    elementsEl.textContent = '0';
                }
            });
        }
    });

    // Set version
    const manifest = chrome.runtime.getManifest();
    document.getElementById('app-version').textContent = manifest.version;
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

            // Format JSON nicely (2 spaces)
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

        // Send to content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;

            chrome.tabs.sendMessage(tabs[0].id, {
                type: 'UPDATE_STRATEGY',
                payload: config
            }, (response) => {
                if (response && response.success) {
                    statusEl.textContent = 'Saved & Reloaded!';
                    statusEl.className = 'success';
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
        // resetStatus();
    }
}
