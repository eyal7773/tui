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

    // Initial Data Load
    refreshState();



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
                // Feature toggle removed from UI, but we keep listening just in case
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
    chrome.storage.local.get(['totalActions'], (result) => {
        if (result.totalActions !== undefined) {
            document.getElementById('total-actions').textContent = result.totalActions;
        }
    });

    // 1.5 Load Admin from Session
    chrome.storage.session.get(['tuiAdminMode'], (result) => {
        updateAdminInterface(result.tuiAdminMode || false);
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


