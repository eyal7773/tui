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
    document.getElementById('reset-config').addEventListener('click', resetConfig);

    // Load initial stats
    updateStats();
    // ... (skip unrelated lines to keep context short? No, I must replace contiguous block or append. I will append the function at end and add listener at top)
    // Actually I will duplicate some context
    // Toggle listener
    const toggle = document.getElementById('site-toggle');

    // ...
});

// ... (stats functions)

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
    const resetStatus = () => setTimeout(() => { statusEl.textContent = ''; statusEl.className = ''; }, 3000);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return;

        // We can just clear storage here, but we need the hostname. 
        // Asking content script to do it is cleaner as it knows its hostname.
        chrome.tabs.sendMessage(tabs[0].id, { type: 'RESET_STRATEGY' }, (response) => {
            if (response && response.success) {
                statusEl.textContent = 'Restored Defaults!';
                statusEl.className = 'success';
                loadConfig(); // Refresh editor
            } else {
                statusEl.textContent = 'Failed to reset.';
                statusEl.className = 'error';
            }
            resetStatus();
        });
    });
}
