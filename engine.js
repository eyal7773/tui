// Core Engine for TUI Navigator

class TUIEngine {
    constructor() {
        this.focusIndex = -1;
        this.interactiveElements = [];
        this.activeZoneId = null; // New: Track active zone
        this.zoneElementsMap = new Map(); // New: Cache elements per zone

        this.isActive = false;
        this.isEnabled = true;
        this.adminMode = false; // Admin Mode
        this.strategy = null;
        this.observer = null;
        this.debounceTimer = null;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    async init() {
        const storage = await chrome.storage.local.get(['tuiEnabled', 'tui_overrides', 'tuiAdminMode']);
        this.isEnabled = storage.tuiEnabled !== false;
        this.adminMode = !!storage.tuiAdminMode;

        this.log('[TUI-LOG] Initializing TUI Engine...');

        // Listen for dynamic admin mode toggle
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.tuiAdminMode) {
                this.adminMode = !!changes.tuiAdminMode.newValue;
                if (this.adminMode) console.log('[TUI-LOG] Admin Mode Enabled');
            }
        });

        const manager = window.TUIStrategyManager;
        const hostname = window.location.hostname;
        let overrideConfig = null;
        if (storage.tui_overrides && storage.tui_overrides[hostname]) {
            this.log('[TUI-LOG] Found override for this site.');
            overrideConfig = storage.tui_overrides[hostname];
        }

        if (!manager) {
            console.warn('TUI: StrategyManager not found.');
            return;
        }

        if (overrideConfig) {
            this.strategy = manager.createStrategy(overrideConfig);
        } else {
            this.strategy = manager.getStrategy(window.location.href);
        }

        this.attachMessageListener();

        if (this.strategy && this.isEnabled) {
            this.log(`[TUI-LOG] Active on ${this.strategy.name}`);
            this.isActive = true;
            this.updateElements();
            this.attachDOMListeners();
        } else if (this.strategy) {
            this.log(`TUI: Match found (${this.strategy.name}) but extension is disabled.`);
        }

        // Initial Broadcast
        this.broadcastStatus();

        // Re-broadcast on bfcache restore
        window.addEventListener('pageshow', (event) => {
            // Even if not persisted, it doesn't hurt to re-broadcast on show
            // But definitely if persisted (restored from cache)
            if (event.persisted) {
                this.log('[TUI-LOG] Page restored from cache. Re-broadcasting status.');
            }
            this.broadcastStatus();
        });
    }

    log(...args) {
        if (this.adminMode) {
            console.log(...args);
        }
    }

    broadcastStatus() {
        try {
            chrome.runtime.sendMessage({
                type: 'STATUS_UPDATE',
                payload: {
                    supported: !!this.strategy,
                    enabled: this.isEnabled,
                    siteName: this.strategy ? this.strategy.name : null
                }
            });
        } catch (e) {
            // Ignore (bg might sleep)
        }
    }

    // ... attachMessageListener remains same usually, but skipping for brevity in this replace block ... 
    // We need to keep it if we are replacing the whole block or be careful.
    // The user instruction implies replacing significant chunks. 
    // Since I can't "skip" easily in a contiguous block, I will include attachMessageListener logic if needed, 
    // but the prompt allows me to target specific lines. 
    // Let's assume I am replacing the Constructor through moveFocus.

    attachMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'GET_STATUS') {
                sendResponse({
                    supported: !!this.strategy,
                    siteName: this.strategy ? this.strategy.name : null,
                    elementCount: this.interactiveElements.length,
                    activeZone: this.activeZoneId,
                    enabled: this.isEnabled
                });
            } else if (message.type === 'GET_STRATEGY') {
                if (this.strategy) {
                    const s = this.strategy;
                    const response = {
                        name: s.name,
                        type: s.type,
                        selector: s.selector,
                        pattern: s.pattern instanceof RegExp ? s.pattern.toString() : s.pattern,
                        customExtract: typeof s.customExtract === 'function' ? s.customExtract.toString() : s.customExtract,
                        zones: s.zones,
                        neighbors: s.neighbors
                    };
                    sendResponse(response);
                } else {
                    sendResponse(null);
                }
            } else if (message.type === 'UPDATE_STRATEGY') {
                this.handleStrategyUpdate(message.payload);
                this.broadcastStatus(); // Update badge
                sendResponse({ success: true });
            } else if (message.type === 'RESET_STRATEGY') {
                const hostname = window.location.hostname;
                chrome.storage.local.get(['tui_overrides'], (result) => {
                    const overrides = result.tui_overrides || {};
                    if (overrides[hostname]) {
                        delete overrides[hostname];
                        chrome.storage.local.set({ tui_overrides: overrides });
                    }
                });

                // Reload default
                const manager = window.TUIStrategyManager;
                this.strategy = manager.getStrategy(window.location.href);
                this.resetFocus();
                this.updateElements();
                this.log('[TUI-LOG] Reset to default strategy.');
                this.broadcastStatus(); // Update badge
                sendResponse({ success: true });
            } else if (message.type === 'TOGGLE_STATE') {
                this.isEnabled = message.payload.enabled;
                if (this.isEnabled && this.strategy) {
                    this.isActive = true;
                    this.updateElements();
                    this.attachDOMListeners();
                } else {
                    this.isActive = false;
                    this.resetFocus();
                    this.disconnectObserver();
                }
                this.broadcastStatus(); // Update badge
            }
        });
    }

    updateElements() {
        if (!this.strategy || !this.isActive) return;

        if (this.strategy.type === 'ZONED_LAYOUT') {
            this.updateZonedElements();
        } else {
            // Legacy/Simple mode
            this.interactiveElements = this.strategy.getElements();
            this.log(`[TUI-LOG] Updated elements. Found: ${this.interactiveElements.length}`);
        }
    }

    updateZonedElements() {
        this.zoneElementsMap.clear();
        this.interactiveElements = []; // Flattened list for fallback?

        let foundDefault = false;

        this.strategy.zones.forEach(zone => {
            const elements = Array.from(document.querySelectorAll(zone.selector))
                .filter(el => el.offsetParent !== null);

            this.zoneElementsMap.set(zone.id, elements);
            this.interactiveElements.push(...elements); // Keep flat list for generic metrics or easy access

            // Set default zone if not set
            if (!this.activeZoneId && zone.default && elements.length > 0) {
                this.activeZoneId = zone.id;
                foundDefault = true;
            }
        });

        if (!this.activeZoneId && this.strategy.zones.length > 0) {
            // Fallback to first zone with elements
            for (const zone of this.strategy.zones) {
                if (this.zoneElementsMap.get(zone.id).length > 0) {
                    this.activeZoneId = zone.id;
                    break;
                }
            }
        }

        this.log(`[TUI-LOG] Updated Zoned Elements. Active Zone: ${this.activeZoneId}`);
    }

    attachDOMListeners() {
        if (this.hasAttachedListeners) return;
        document.addEventListener('keydown', (e) => this.handleKeydown(e));
        this.observer = new MutationObserver(() => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.updateElements();
            }, 500);
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
        this.hasAttachedListeners = true;
    }

    disconnectObserver() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        this.hasAttachedListeners = false;
    }

    handleKeydown(e) {
        if (!this.isActive || !this.isEnabled) return;

        // Ignore inputs
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable) {
            return;
        }

        if (e.key.startsWith('Arrow') || ['j', 'k', 'h', 'l'].includes(e.key)) {
            e.preventDefault();
            this.handleNavigation(e.key);
        } else if (e.key === 'Enter') {
            this.activateCurrent();
        } else if (e.key === 'Escape') {
            this.resetFocus();
        }
    }

    handleNavigation(key) {
        this.updateElements(); // Refresh

        // Track the user action
        this.trackMetric('tui_nav_move');

        if (this.strategy.type === 'ZONED_LAYOUT') {
            this.handleZonedNavigation(key);
        } else {
            this.handleLegacyNavigation(key); // Refactored original logic
        }
    }

    handleLegacyNavigation(key) {
        let direction = 0;
        if (key === 'ArrowDown' || key === 'j') direction = 1;
        if (key === 'ArrowUp' || key === 'k') direction = -1;

        if (direction !== 0) {
            this.moveFocusLegacy(direction);
        }
    }

    handleZonedNavigation(key) {
        if (!this.activeZoneId) return;

        const currentZone = this.strategy.zones.find(z => z.id === this.activeZoneId);
        const elements = this.zoneElementsMap.get(this.activeZoneId) || [];

        // 1. Determine Intent
        let internalChange = 0;
        let trySwitch = null;

        if (key === 'ArrowDown' || key === 'j') {
            if (currentZone.direction === 'vertical') internalChange = 1;
            else trySwitch = 'down';
        } else if (key === 'ArrowUp' || key === 'k') {
            if (currentZone.direction === 'vertical') internalChange = -1;
            else trySwitch = 'up';
        } else if (key === 'ArrowRight' || key === 'l') {
            if (currentZone.direction === 'horizontal') internalChange = 1;
            else trySwitch = 'right';
        } else if (key === 'ArrowLeft' || key === 'h') {
            if (currentZone.direction === 'horizontal') internalChange = -1;
            else trySwitch = 'left';
        }

        // 2. Try Internal Move
        if (internalChange !== 0) {
            const newIndex = this.focusIndex + internalChange;
            if (newIndex >= 0 && newIndex < elements.length) {
                this.focusIndex = newIndex;
                this.renderFocusZoned(elements[newIndex]);
                return;
            } else {
                // Out of bounds -> treat as exit attempt
                if (internalChange > 0) trySwitch = (currentZone.direction === 'vertical') ? 'down' : 'right';
                else trySwitch = (currentZone.direction === 'vertical') ? 'up' : 'left';
            }
        }

        // 3. Try Switch Zone
        if (trySwitch) {
            this.attemptZoneSwitch(currentZone, trySwitch);
        }
    }

    attemptZoneSwitch(currentZone, direction) {
        // Use neighbors config
        const neighbors = this.strategy.neighbors || {};
        const zoneNeighbors = neighbors[currentZone.id];

        if (zoneNeighbors && zoneNeighbors[direction]) {
            const targets = Array.isArray(zoneNeighbors[direction])
                ? zoneNeighbors[direction]
                : [zoneNeighbors[direction]];

            for (const targetZoneId of targets) {
                const targetElements = this.zoneElementsMap.get(targetZoneId);

                if (targetElements && targetElements.length > 0) {
                    // Switch
                    this.log(`[TUI-LOG] Switching Zone: ${currentZone.id} -> ${targetZoneId} (${direction})`);
                    this.activeZoneId = targetZoneId;
                    this.focusIndex = 0; // Reset to top of new zone (could be improved with spatial later)
                    this.renderFocusZoned(targetElements[0]);
                    return; // Found a valid target
                } else {
                    this.log(`[TUI-LOG] Skipping empty/missing zone: ${targetZoneId}`);
                }
            }
        }
    }

    moveFocusLegacy(direction) {
        // Old logic for non-zoned sites
        const max = this.interactiveElements.length;
        let newIndex = this.focusIndex + direction;
        if (newIndex < 0) newIndex = 0;
        if (newIndex >= max) newIndex = max - 1;

        if (newIndex !== this.focusIndex) {
            this.focusIndex = newIndex;
            // Need to handle rendering locally since I removed renderFocus arg dependency
            const el = this.interactiveElements[newIndex];
            this.renderSimple(el);
        }
    }

    renderSimple(el) {
        // Clear all
        this.interactiveElements.forEach(e => e.classList.remove('tui-focus-indicator'));
        if (el) {
            el.classList.add('tui-focus-indicator');
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.focus({ preventScroll: true });
        }
    }

    renderFocusZoned(el) {
        // Clear all (safest)
        document.querySelectorAll('.tui-focus-indicator').forEach(e => e.classList.remove('tui-focus-indicator'));
        if (el) {
            el.classList.add('tui-focus-indicator');
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.focus({ preventScroll: true });
        }
    }

    activateCurrent() {
        let el = null;
        if (this.strategy.type === 'ZONED_LAYOUT') {
            const elements = this.zoneElementsMap.get(this.activeZoneId);
            if (elements && elements[this.focusIndex]) el = elements[this.focusIndex];
        } else {
            el = this.interactiveElements[this.focusIndex];
        }

        if (el) {
            el.click();
            this.trackMetric('tui_nav_click');
        }
    }

    resetFocus() {
        this.focusIndex = -1;
        document.querySelectorAll('.tui-focus-indicator').forEach(e => e.classList.remove('tui-focus-indicator'));
        this.trackMetric('tui_nav_reset');
    }

    trackMetric(actionType) {
        try {
            chrome.runtime.sendMessage({
                type: 'METRIC_EVENT',
                payload: { action: actionType }
            });
        } catch (e) {
            // Context invalidated
        }
    }


    handleStrategyUpdate(config) {
        this.log('[TUI-LOG] Received strategy update:', config);

        // Save to storage (persist)
        const hostname = window.location.hostname;
        chrome.storage.local.get(['tui_overrides'], (result) => {
            const overrides = result.tui_overrides || {};
            overrides[hostname] = config;
            chrome.storage.local.set({ tui_overrides: overrides });
        });

        // Apply immediately
        const manager = window.TUIStrategyManager;
        this.strategy = manager.createStrategy(config);

        // Reset and re-init
        this.resetFocus();
        this.updateElements();
        this.log(`[TUI-LOG] Strategy reloaded. Found ${this.interactiveElements.length} elements.`);
    }
}

// Initialize
new TUIEngine();
