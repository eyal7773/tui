// Core Engine for TUI Navigator

class TUIEngine {
    constructor() {
        this.focusIndex = -1;
        this.interactiveElements = [];
        this.isActive = false;
        this.isEnabled = true; // Global toggle state
        this.strategy = null;
        this.observer = null;
        this.debounceTimer = null;

        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    async init() {
        // 1. Check if globally enabled
        const storage = await chrome.storage.local.get(['tuiEnabled']);
        this.isEnabled = storage.tuiEnabled !== false; // Default true

        // 2. Identify Strategy
        const manager = window.TUIStrategyManager;
        if (!manager) {
            console.warn('TUI: StrategyManager not found.');
            return;
        }

        this.strategy = manager.getStrategy(window.location.href);

        // 3. Setup Listeners
        this.attachMessageListener();

        if (this.strategy && this.isEnabled) {
            console.log(`TUI: Active on ${this.strategy.name}`);
            this.isActive = true;
            this.updateElements();
            this.attachDOMListeners();
        } else if (this.strategy) {
            console.log(`TUI: Match found (${this.strategy.name}) but extension is disabled.`);
        }
    }

    attachMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'GET_STATUS') {
                sendResponse({
                    supported: !!this.strategy,
                    siteName: this.strategy ? this.strategy.name : null,
                    elementCount: this.interactiveElements.length,
                    enabled: this.isEnabled
                });
            } else if (message.type === 'TOGGLE_STATE') {
                this.isEnabled = message.payload.enabled;
                if (this.isEnabled && this.strategy) {
                    this.isActive = true;
                    this.updateElements();
                    this.attachDOMListeners();
                    console.log('TUI: Enabled via toggle');
                } else {
                    this.isActive = false;
                    this.resetFocus();
                    this.disconnectObserver();
                    console.log('TUI: Disabled via toggle');
                }
            }
        });
    }

    updateElements() {
        if (this.strategy && this.isActive) {
            this.interactiveElements = this.strategy.getElements();
            // console.log(`TUI: Found ${this.interactiveElements.length} elements.`);
        }
    }

    attachDOMListeners() {
        // Avoid double attaching
        if (this.hasAttachedListeners) return;

        document.addEventListener('keydown', (e) => this.handleKeydown(e));

        // MutationObserver to handle dynamic content
        this.observer = new MutationObserver(() => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.updateElements();
            }, 500); // 500ms debounce
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
        // Note: We don't remove keydown listener easily without binding reference, 
        // but checking this.isActive in handleKeydown is sufficient.
    }

    handleKeydown(e) {
        if (!this.isActive || !this.isEnabled || this.interactiveElements.length === 0) return;

        // Ignore if user is typing in an input
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable) return;

        switch (e.key) {
            case 'ArrowDown':
            case 'j': // Vim style
                e.preventDefault();
                this.moveFocus(1);
                break;
            case 'ArrowUp':
            case 'k': // Vim style
                e.preventDefault();
                this.moveFocus(-1);
                break;
            case 'Enter':
                // Let default happen if we are just focused, but we might want to force click
                // e.preventDefault(); 
                this.activateCurrent();
                break;
            case 'Escape':
                this.resetFocus();
                break;
        }
    }

    moveFocus(direction) {
        this.updateElements(); // Refresh list to be safe

        const oldIndex = this.focusIndex;
        let newIndex = this.focusIndex + direction;

        // Bounds checking
        if (newIndex < 0) newIndex = 0;
        if (newIndex >= this.interactiveElements.length) newIndex = this.interactiveElements.length - 1;

        if (newIndex !== oldIndex || this.focusIndex === -1) {
            this.focusIndex = newIndex;
            this.renderFocus(oldIndex, newIndex);
            this.trackMetric('tui_nav_vertical');
        }
    }

    renderFocus(oldIndex, newIndex) {
        // Remove class from old
        if (oldIndex >= 0 && this.interactiveElements[oldIndex]) {
            this.interactiveElements[oldIndex].classList.remove('tui-focus-indicator');
        }

        // Add class to new
        if (newIndex >= 0 && this.interactiveElements[newIndex]) {
            const el = this.interactiveElements[newIndex];
            el.classList.add('tui-focus-indicator');
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.focus({ preventScroll: true }); // Native focus as well for accessibility
        }
    }

    activateCurrent() {
        if (this.focusIndex >= 0 && this.interactiveElements[this.focusIndex]) {
            // this.interactiveElements[this.focusIndex].click(); 
            // Native enter usually triggers click on links/buttons, but explicit click is safer for some SPAs
            // However, if we focused it above, Enter might naturally work.
            // Let's force click to be sure.
            this.interactiveElements[this.focusIndex].click();
            this.trackMetric('tui_nav_click');
        }
    }

    resetFocus() {
        if (this.focusIndex >= 0) {
            this.renderFocus(this.focusIndex, -1);
            this.focusIndex = -1;
        }
        this.trackMetric('tui_nav_reset');
    }

    trackMetric(actionType) {
        // Send to background
        try {
            chrome.runtime.sendMessage({
                type: 'METRIC_EVENT',
                payload: { action: actionType }
            });
        } catch (e) {
            // Context might be invalidated
            console.log('TUI Metric Error:', e);
        }
    }
}

// Initialize
new TUIEngine();
