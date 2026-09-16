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

/* ──────────────────────────────────────────────────────────────────────────
 * Weekly recap: the opt-out toggle and the admin test buttons.
 * ────────────────────────────────────────────────────────────────────────── */

const RECAP_REASONS = {
    disabled: 'Switched off above.',
    'install-date-unknown': 'No install date recorded yet.',
    'too-new': 'Still inside the first week after install.',
    'wrong-day': 'Only Thursday to Saturday.',
    'too-early': 'Not before 10am.',
    'already-sent': 'Already sent this week.',
    'no-activity': 'No navigation recorded in the last seven days.',
    'blocked-by-system': 'Chrome refused it — check notifications in your OS settings.',
    ok: 'Everything lines up; it would fire now.',
    forced: 'Sent.'
};

function explainRecap(reason) {
    return RECAP_REASONS[reason] || `Not sent (${reason}).`;
}

function initRecapSettings() {
    const toggle = document.getElementById('recap-toggle');
    if (!toggle) return;

    chrome.storage.local.get(['weeklyRecapEnabled'], (result) => {
        toggle.checked = result.weeklyRecapEnabled !== false;
    });

    toggle.addEventListener('change', () => {
        chrome.storage.local.set({ weeklyRecapEnabled: toggle.checked }, () => {
            setStatus('recap-status', toggle.checked
                ? 'On. Expect a note on Thursday.'
                : 'Off. Nothing will be sent.');
        });
    });

    // The notification can turn itself off, so reflect that if it happens
    // while the popup is open.
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.weeklyRecapEnabled) {
            toggle.checked = changes.weeklyRecapEnabled.newValue !== false;
        }
    });

    // Admin-only buttons; absent from the DOM for everyone else is fine either way.
    const testBtn = document.getElementById('recap-test-btn');
    const dryBtn = document.getElementById('recap-dry-btn');

    if (testBtn) {
        testBtn.addEventListener('click', () => {
            setStatus('recap-test-status', 'Sending…');
            chrome.runtime.sendMessage({ type: 'RECAP_TEST', force: true }, (res) => {
                if (chrome.runtime.lastError) {
                    setStatus('recap-test-status', chrome.runtime.lastError.message, true);
                    return;
                }
                setStatus('recap-test-status', explainRecap(res && res.reason), !(res && res.sent));
            });
        });
    }

    if (dryBtn) {
        dryBtn.addEventListener('click', () => {
            setStatus('recap-test-status', 'Checking…');
            chrome.runtime.sendMessage({ type: 'RECAP_TEST', force: false }, (res) => {
                if (chrome.runtime.lastError) {
                    setStatus('recap-test-status', chrome.runtime.lastError.message, true);
                    return;
                }
                setStatus('recap-test-status', explainRecap(res && res.reason), !(res && res.sent));
            });
        });
    }
}

document.addEventListener('DOMContentLoaded', initRecapSettings);

/* ──────────────────────────────────────────────────────────────────────────
 * Ring colour.
 *
 * Storage is the source of truth and the engine reacts to it, so the popup
 * only ever writes a colour and redraws itself from what came back.
 * ────────────────────────────────────────────────────────────────────────── */

function initRingColor() {
    const swatchRow = document.getElementById('ring-swatches');
    if (!swatchRow) return;

    if (!window.TuiRingStyle) {
        swatchRow.textContent = 'Unavailable: ring-style.js failed to load.';
        return;
    }

    const RS = window.TuiRingStyle;
    const KEYS = RS.KEYS;

    const customInput = document.getElementById('ring-custom-input');
    const widthInput = document.getElementById('ring-width-input');
    const widthValue = document.getElementById('ring-width-value');
    const fillInput = document.getElementById('ring-fill-input');
    const motionSelect = document.getElementById('motion-select');
    const previewBox = document.getElementById('ring-preview-box');
    const valueLabel = document.getElementById('ring-value');

    widthInput.min = RS.MIN_WIDTH;
    widthInput.max = RS.MAX_WIDTH;

    function save(patch) {
        chrome.storage.local.set(patch);
    }

    function describeMotion(mode) {
        if (mode === 'smooth') return 'Always animated, whatever the system says.';
        if (mode === 'instant') return 'No animation. Navigation feels quicker.';

        // 'auto' is the only mode whose effect depends on the machine, so it is
        // the only one worth spelling out.
        const reduced = window.matchMedia
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        return reduced
            ? 'Your system asks for reduced motion, so scrolling is instant.'
            : 'Your system allows motion, so scrolling is smooth.';
    }

    function render(state) {
        const color = RS.normalizeHex(state[KEYS.color]) || RS.DEFAULT_COLOR;
        const width = RS.normalizeWidth(state[KEYS.width]) || RS.DEFAULT_WIDTH;
        const fill = state[KEYS.fill] !== false;
        const motion = RS.normalizeMotion(state[KEYS.motion]) || RS.DEFAULT_MOTION;

        // The same helper the engine uses, so the preview cannot drift from the
        // real ring.
        const vars = RS.ringVariables({ color, width, fill });
        for (const [name, value] of Object.entries(vars)) {
            previewBox.style.setProperty(name, value);
        }

        valueLabel.textContent = color;
        customInput.value = color;
        widthInput.value = width;
        widthValue.textContent = `${width}px`;
        fillInput.checked = fill;
        motionSelect.value = motion;
        setStatus('motion-status', describeMotion(motion));

        swatchRow.querySelectorAll('.swatch').forEach((el) => {
            const selected = el.dataset.hex === color;
            el.classList.toggle('selected', selected);
            el.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
    }

    function readAndRender() {
        chrome.storage.local.get(
            [KEYS.color, KEYS.width, KEYS.fill, KEYS.motion],
            (result) => render(result)
        );
    }

    RS.PRESETS.forEach((preset) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'swatch';
        button.dataset.hex = preset.hex;
        button.style.backgroundColor = preset.hex;
        button.title = preset.name;
        button.setAttribute('aria-label', `${preset.name} ring`);
        button.addEventListener('click', () => save({ [KEYS.color]: preset.hex }));
        swatchRow.appendChild(button);
    });

    // 'input' rather than 'change' so dragging updates the page live.
    customInput.addEventListener('input', () => {
        const hex = RS.normalizeHex(customInput.value);
        if (hex) save({ [KEYS.color]: hex });     // never store something unpaintable
    });

    widthInput.addEventListener('input', () => {
        const width = RS.normalizeWidth(widthInput.value);
        if (width) save({ [KEYS.width]: width });
    });

    fillInput.addEventListener('change', () => save({ [KEYS.fill]: fillInput.checked }));

    motionSelect.addEventListener('change', () => {
        const mode = RS.normalizeMotion(motionSelect.value);
        if (mode) save({ [KEYS.motion]: mode });
    });

    document.getElementById('ring-reset-btn').addEventListener('click', () => save({
        [KEYS.color]: RS.DEFAULT_COLOR,
        [KEYS.width]: RS.DEFAULT_WIDTH,
        [KEYS.fill]: true,
        [KEYS.motion]: RS.DEFAULT_MOTION
    }));

    readAndRender();

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;
        if (changes[KEYS.color] || changes[KEYS.width]
            || changes[KEYS.fill] || changes[KEYS.motion]) {
            readAndRender();
        }
    });

    // 'Follow my system' changes meaning when the system does.
    if (window.matchMedia) {
        window.matchMedia('(prefers-reduced-motion: reduce)')
            .addEventListener('change', readAndRender);
    }
}

document.addEventListener('DOMContentLoaded', initRingColor);
