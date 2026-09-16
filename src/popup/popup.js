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



/* ──────────────────────────────────────────────────────────────────────────
 * Personal settings: the excluded-sites list.
 * Storage is the single source of truth; the UI always redraws from it, so the
 * popup and any open tab stay in step through chrome.storage.onChanged.
 * ────────────────────────────────────────────────────────────────────────── */

const EXCLUDED_KEY = (window.TuiSiteRules && TuiSiteRules.STORAGE_KEY) || 'tuiExcludedSites';
let currentHostname = null;
let excludedSites = [];

function readExcluded() {
    return new Promise((resolve) => {
        chrome.storage.local.get([EXCLUDED_KEY], (result) => {
            const list = result[EXCLUDED_KEY];
            resolve(Array.isArray(list) ? list : []);
        });
    });
}

function writeExcluded(list) {
    return new Promise((resolve) => {
        const sorted = [...new Set(list)].sort();
        chrome.storage.local.set({ [EXCLUDED_KEY]: sorted }, () => resolve(sorted));
    });
}

function setStatus(id, message, isError) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('is-error', !!isError);
}

async function addExcludedSite(rawValue) {
    const domain = TuiSiteRules.normalizeDomain(rawValue);
    if (!domain) {
        setStatus('add-site-status', 'That does not look like a domain.', true);
        return false;
    }
    if (excludedSites.includes(domain)) {
        setStatus('add-site-status', `${domain} is already on the list.`, false);
        return false;
    }

    excludedSites = await writeExcluded([...excludedSites, domain]);
    renderSettings();
    setStatus('add-site-status', `Added ${domain}.`, false);
    return true;
}

async function removeExcludedSite(domain) {
    excludedSites = await writeExcluded(excludedSites.filter((d) => d !== domain));
    renderSettings();
    setStatus('add-site-status', `Removed ${domain}.`, false);
}

function renderSettings() {
    // -- current site --
    const siteEl = document.getElementById('current-site');
    const toggleBtn = document.getElementById('toggle-site-btn');
    if (!siteEl || !toggleBtn) return;

    const excludedHere = TuiSiteRules.isExcluded(currentHostname, excludedSites);

    if (!currentHostname) {
        siteEl.textContent = 'This page cannot be excluded.';
        siteEl.classList.remove('is-excluded');
        toggleBtn.disabled = true;
        toggleBtn.textContent = 'Turn off here';
        setStatus('site-status', '');
    } else {
        siteEl.textContent = currentHostname;
        siteEl.classList.toggle('is-excluded', excludedHere);
        toggleBtn.disabled = false;
        toggleBtn.textContent = excludedHere ? 'Turn back on here' : 'Turn off here';

        if (excludedHere) {
            // Say which rule is responsible - it may be a parent domain.
            const rule = excludedSites.find((d) => TuiSiteRules.matchesDomain(currentHostname, d));
            setStatus('site-status', rule && rule !== currentHostname
                ? `Off, because ${rule} is excluded.`
                : 'Off on this site.');
        } else {
            setStatus('site-status', '');
        }
    }

    // -- the list --
    const list = document.getElementById('excluded-list');
    const empty = document.getElementById('excluded-empty');
    list.textContent = '';
    empty.style.display = excludedSites.length ? 'none' : 'block';

    excludedSites.forEach((domain) => {
        const li = document.createElement('li');

        const name = document.createElement('span');
        name.className = 'domain';
        name.textContent = domain;          // textContent, never innerHTML

        const remove = document.createElement('button');
        remove.className = 'remove-site-btn';
        remove.type = 'button';
        remove.textContent = '×';
        remove.title = `Remove ${domain}`;
        remove.setAttribute('aria-label', `Remove ${domain}`);
        remove.addEventListener('click', () => removeExcludedSite(domain));

        li.append(name, remove);
        list.appendChild(li);
    });
}

async function initSettingsTab() {
    if (!window.TuiSiteRules) {
        // Without the shared rules the tab cannot match domains correctly, and a
        // half-working exclusion list is worse than an honest message.
        const el = document.getElementById('current-site');
        if (el) el.textContent = 'Settings unavailable: site-rules.js failed to load.';
        return;
    }

    excludedSites = await readExcluded();

    // The active tab's URL is what the exclusion list matches on.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const url = tabs && tabs[0] && tabs[0].url;
        try {
            const host = url ? new URL(url).hostname : null;
            // chrome:// and file:// pages have no host we can act on.
            currentHostname = host && TuiSiteRules.isValidDomain(host) ? host : null;
        } catch (e) {
            currentHostname = null;
        }
        renderSettings();
    });

    document.getElementById('add-site-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('add-site-input');
        const added = await addExcludedSite(input.value);
        if (added) input.value = '';
    });

    document.getElementById('toggle-site-btn').addEventListener('click', async () => {
        if (!currentHostname) return;

        const rule = excludedSites.find((d) => TuiSiteRules.matchesDomain(currentHostname, d));
        if (rule) {
            await removeExcludedSite(rule);
            setStatus('site-status', `${rule} is back on.`);
        } else {
            await addExcludedSite(currentHostname);
        }
    });

    // Keep the list honest if another popup or page changes it.
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes[EXCLUDED_KEY]) {
            excludedSites = Array.isArray(changes[EXCLUDED_KEY].newValue)
                ? changes[EXCLUDED_KEY].newValue
                : [];
            renderSettings();
        }
    });
}

document.addEventListener('DOMContentLoaded', initSettingsTab);
