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

    // Open Stats page
    document.getElementById('open-stats-btn').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('stats/stats.html') });
    });

    // Download Logs button
    document.getElementById('download-logs-btn').addEventListener('click', () => {
        const statusEl = document.getElementById('logs-status');
        statusEl.textContent = '';
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) {
                statusEl.textContent = 'No active tab found.';
                return;
            }
            chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_DEBUG_LOGS' }, (response) => {
                if (chrome.runtime.lastError || !response) {
                    statusEl.textContent = 'Error: ' + (chrome.runtime.lastError?.message || 'No response from page.');
                    return;
                }
                const logs = response.logs;
                if (!logs || logs.length === 0) {
                    statusEl.textContent = 'No logs yet. Enable debug mode first.';
                    return;
                }
                const blob = new Blob([logs.join('\n')], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `tui-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                statusEl.textContent = `Downloaded ${logs.length} log entries.`;
            });
        });
    });



    // Download Page (MHTML) button
    document.getElementById('download-page-btn').addEventListener('click', () => {
        const statusEl = document.getElementById('page-status');
        statusEl.textContent = '';
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) {
                statusEl.textContent = 'No active tab found.';
                return;
            }
            const tab = tabs[0];
            chrome.pageCapture.saveAsMHTML({ tabId: tab.id }, (mhtmlData) => {
                if (chrome.runtime.lastError || !mhtmlData) {
                    statusEl.textContent = 'Error: ' + (chrome.runtime.lastError?.message || 'Capture failed.');
                    return;
                }
                const hostname = new URL(tab.url).hostname.replace(/[^a-z0-9.-]/gi, '_') || 'page';
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `${hostname}-${timestamp}.mhtml`;
                const blob = new Blob([mhtmlData], { type: 'multipart/related' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                statusEl.textContent = `Saved as ${filename}`;
            });
        });
    });

    // Download Report (ZIP) button
    document.getElementById('download-report-btn').addEventListener('click', () => {
        const statusEl = document.getElementById('report-status');
        const problemText = document.getElementById('problem-description').value.trim();
        statusEl.textContent = 'Generating report...';

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) { statusEl.textContent = 'No active tab found.'; return; }
            const tab = tabs[0];
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

            chrome.tabs.sendMessage(tab.id, { type: 'GET_DEBUG_LOGS' }, (logResponse) => {
                const logs = (!chrome.runtime.lastError && logResponse?.logs) ? logResponse.logs : [];
                const logsText = logs.length ? logs.join('\n') : '(no logs)';

                chrome.pageCapture.saveAsMHTML({ tabId: tab.id }, (mhtmlData) => {
                    if (chrome.runtime.lastError || !mhtmlData) {
                        statusEl.textContent = 'Error capturing page: ' + (chrome.runtime.lastError?.message || 'failed');
                        return;
                    }

                    const zip = new JSZip();
                    zip.file('problem.txt', problemText || '(no description provided)');
                    zip.file(`tui-logs-${timestamp}.txt`, logsText);
                    zip.file(`page-${timestamp}.mhtml`, mhtmlData);

                    zip.generateAsync({ type: 'blob' }).then((zipBlob) => {
                        const url = URL.createObjectURL(zipBlob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `tui-report-${timestamp}.zip`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        statusEl.textContent = 'Report downloaded.';
                    });
                });
            });
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


