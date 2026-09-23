/**
 * TUI Spatial Navigation Engine
 * A pure geometric navigation engine that doesn't rely on site-specific configs.
 */

class SpatialEngine {
    constructor() {
        this.candidates = [];
        this.candidatesDirty = true;
        this.isEnabled = true;
        this.debugMode = false;
        this.logBuffer = [];
        this._originalConsoleLog = null;
        this._originalConsoleGroup = null;
        this._originalConsoleGroupEnd = null;

        // Excluded sites. userEnabled is the global on/off switch; isExcluded is
        // this particular site being on the list. isEnabled is derived from both,
        // so every existing `if (!this.isEnabled) return` guard covers exclusion too.
        this.userEnabled = true;
        this.isExcluded = false;
        this.excludedSites = [];
        this.currentHostname = null;
        this.hostnameResolved = false;

        // Escape hands the keyboard to the page until Escape takes it back. Per
        // page, and deliberately not persisted: a fresh load starts navigating.
        this.isSuspended = false;

        // The last arrow that actually moved the ring. Home and End read it to
        // decide which axis they run along. Starting at ArrowRight means End
        // works on the first press, before anything has moved.
        this.lastDirection = 'ArrowRight';

        // Ring appearance and motion, applied to the spotlight as custom
        // properties. Motion also decides how scrolling behaves.
        this.ringColor = null;
        this.ringWidth = null;
        this.ringFill = true;
        this.motion = null;
        this.reducedMotionQuery = null;

        // State
        this.isActiveMode = false; // "Lazy Focus": only show green ring after user actively navigates with arrows
        this.lastActiveElement = null;
        this.isNavigating = false;
        this.observer = null;
        this.focusMonitorInterval = null;
        this.failedFocusElements = new Set(); // Track elements that recently failed to receive focus

        // Menu State
        this.isMenuOpen = false;
        this.menuContainer = null;
        this.menuItems = [];
        this.selectedMenuIndex = -1;

        // Initialize
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        console.log('[TUI Spatial] Initializing...');
        this.loadSettings();

        // Create Spotlight Element
        this.createSpotlight();

        // Use Capture Phase to intercept events before the page traps them
        document.addEventListener('keydown', (e) => this.handleKeydown(e), { capture: true });
        // NOTE: We keep scroll passive and bubbling as scroll doesn't usually get trapped like keys
        window.addEventListener('scroll', () => this.handleScroll(), { passive: true });

        // Passive interaction listeners to sync state without interference
        document.addEventListener('mousedown', (e) => this.handleInteraction(e), { passive: true });
        document.addEventListener('click', (e) => this.handleInteraction(e), { passive: true });
        document.addEventListener('keyup', (e) => this.handleInteraction(e), { passive: true });

        // Handle window resize to update spotlight position if needed
        window.addEventListener('resize', () => {
            if (this.lastActiveElement) this.highlight(this.lastActiveElement);
        });

        // Dynamic DOM Observer
        // Marks candidates dirty so we re-scan when DOM changes
        this.observer = new MutationObserver((records) => {
            this.candidatesDirty = true;

            // Sync with active element if it changed effectively during DOM updates
            // (e.g. "New Chat" clicked -> DOM updates -> input gets focus)
            this.monitorFocusChange(500);

            // Content that moves without a scroll leaves the ring behind: on
            // CNN an ad loads above the story after the ring is on it and
            // pushes the story 300px down. Moving the ring writes its own
            // style, so its records are ignored or this would never settle.
            if (records.some(r => r.target !== this.spotlight)) this.scheduleRingUpdate(true);
        });
        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class', 'hidden', 'disabled']
        });

        // An image that finishes loading shifts the page without any mutation;
        // the body growing is the sign of it.
        if (typeof ResizeObserver === 'function') {
            this.bodyResizeObserver = new ResizeObserver(() => this.scheduleRingUpdate(true));
            this.bodyResizeObserver.observe(document.body);
        }

        // Listen for storage changes to update debug mode dynamically
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local') {
                if (changes.tuiEnabled) {
                    this.userEnabled = changes.tuiEnabled.newValue !== false;
                    this.applyEnabledState();
                }
                if (changes.tuiRingColor || changes.tuiRingWidth ||
                    changes.tuiRingFill || changes.tuiMotion) {
                    if (changes.tuiRingColor) this.ringColor = changes.tuiRingColor.newValue || null;
                    if (changes.tuiRingWidth) this.ringWidth = changes.tuiRingWidth.newValue ?? null;
                    if (changes.tuiRingFill) this.ringFill = changes.tuiRingFill.newValue !== false;
                    if (changes.tuiMotion) this.motion = changes.tuiMotion.newValue || null;
                    this.applyRingColor();
                }
                if (changes.tuiExcludedSites) {
                    this.excludedSites = Array.isArray(changes.tuiExcludedSites.newValue)
                        ? changes.tuiExcludedSites.newValue
                        : [];
                    this.refreshExclusion();
                }
            }
            if (namespace === 'session') {
                if (changes.tuiAdminMode) {
                    this.debugMode = !!changes.tuiAdminMode.newValue;
                    console.log(`[TUI] Debug Mode ${this.debugMode ? 'Enabled' : 'Disabled'}`);
                    if (this.debugMode) {
                        this.logBuffer = [];
                        this._startLogCapture();
                    } else {
                        this._stopLogCapture();
                    }
                }
            }
        });

        // Broadcast initial status (always supported now)
        this.broadcastStatus();

        // Inject Menu
        this.injectMenu();

        // Listen for log download requests from the popup
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'GET_DEBUG_LOGS') {
                sendResponse({ logs: this.logBuffer.slice() });
                return true;
            }
        });
    }

    createSpotlight() {
        // Check if exists
        let spot = document.getElementById('tui-spotlight');
        if (!spot) {
            spot = document.createElement('div');
            spot.id = 'tui-spotlight';
            spot.className = 'tui-focus-indicator';
            document.body.appendChild(spot);
        }
        this.spotlight = spot;
        this.applyRingColor();
    }

    /**
     * Writes the ring colour onto the spotlight as custom properties. Inline
     * custom properties win over the ones in styles.css, and because the rules
     * there keep !important on the properties themselves, a page still cannot
     * override the ring.
     */
    applyRingColor() {
        if (!this.spotlight) return;

        if (!window.TuiRingStyle) {
            // Listed ahead of this file in the manifest; only reachable if that
            // entry is dropped. The stylesheet fallback keeps the ring visible.
            console.warn('[TUI] ring-style.js did not load; using the default ring style.');
            return;
        }

        const vars = window.TuiRingStyle.ringVariables({
            color: this.ringColor,
            width: this.ringWidth,
            fill: this.ringFill
        });
        vars['--tui-ring-transition'] = this.motionSettings().transition;

        for (const [name, value] of Object.entries(vars)) {
            this.spotlight.style.setProperty(name, value);
        }
    }

    /**
     * Whether to animate, and how. 'auto' defers to the operating system, which
     * the extension used to ignore: every scroll was smooth even for someone who
     * had asked their machine to stop animating things.
     */
    motionSettings() {
        if (!window.TuiRingStyle) {
            // Literals on purpose: scrollBehavior() calls back into here, so
            // anything else would recurse forever.
            return { behavior: 'smooth', transition: 'all 0.1s ease-out' };
        }
        return window.TuiRingStyle.motionSettings(this.motion, this.prefersReducedMotion());
    }

    prefersReducedMotion() {
        try {
            if (!this.reducedMotionQuery) {
                this.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
                // Follow the system setting while the page is open.
                this.reducedMotionQuery.addEventListener('change', () => this.applyRingColor());
            }
            return this.reducedMotionQuery.matches;
        } catch (e) {
            return false;
        }
    }

    /** The value every scroll in this file passes to the browser. */
    scrollBehavior() {
        return this.motionSettings().behavior;
    }



    highlight(el) {
        this.lastActiveElement = el; // Track what we are highlighting

        // FEATURE: Lazy Focus
        // If the user hasn't started using arrow keys yet (isActiveMode is false),
        // we track the element internally but DO NOT show the intrusive green UI.
        // This solves the issue on Google/WhatsApp where autofocus on load creates a Visual Bug.
        if (!this.isActiveMode) {
            if (this.spotlight) this.spotlight.style.display = 'none';
            return;
        }

        // Calculate position
        const rect = el.getBoundingClientRect();
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;

        // Update Spotlight Position
        if (this.spotlight) {
            this.spotlight.style.width = `${rect.width}px`;
            this.spotlight.style.height = `${rect.height}px`;
            this.spotlight.style.top = `${rect.top + scrollY}px`;
            this.spotlight.style.left = `${rect.left + scrollX}px`;

            // Ensure it's visible (in case it was hidden)
            this.spotlight.style.display = 'block';
        }
    }

    /**
     * The hostname shown in the address bar, which is what the exclusion list is
     * written against. Inside an iframe `location.hostname` is the frame's own
     * host, so walk up to the top ancestor instead. Cross-origin frames cannot
     * read window.top, but ancestorOrigins still exposes the chain in Chrome.
     * Returns null when even that is unavailable, and the caller asks background.
     */
    getTopHostname() {
        try {
            if (window.top === window) return location.hostname || null;
        } catch (e) {
            // Cross-origin parent: the comparison itself can throw.
        }

        try {
            const origins = location.ancestorOrigins;
            if (origins && origins.length) {
                const top = origins[origins.length - 1];
                if (top && top !== 'null') return new URL(top).hostname || null;
            }
        } catch (e) {
            // Fall through to the background lookup.
        }

        return null;
    }

    /** Background knows the real tab URL; used only when ancestorOrigins is not. */
    async getTopHostnameFromBackground() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_TAB_HOSTNAME' });
            return (response && response.hostname) || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * True when Escape should mean "swap who owns the keyboard" rather than
     * anything else. Inside a text box Escape already means "leave the box", and
     * in the menu it means "close the menu"; both keep their meaning. A site the
     * user switched off entirely has nothing to hand over.
     */
    canToggleHandover() {
        if (!this.userEnabled || this.isExcluded) return false;
        if (this.isMenuOpen) return false;
        return !this.shouldTrapArrows(document.activeElement);
    }

    /**
     * Hand the keyboard to the page, or take it back. While handed over the
     * engine intercepts nothing, so the site's own shortcuts work exactly as
     * they would without the extension installed.
     */
    setSuspended(suspended) {
        if (this.isSuspended === suspended) return;
        this.isSuspended = suspended;

        if (suspended) {
            // Letting go of focus is the part that matters. Sites like YouTube
            // route their shortcuts by what is focused, so hiding the ring while
            // still holding a link would not give the page its keys back.
            const active = document.activeElement;
            if (active && active !== document.body && typeof active.blur === 'function') {
                active.blur();
            }
            this.lastActiveElement = null;
        }

        this.applyEnabledState();
        console.log(`[TUI] Keyboard ${suspended ? 'handed back to the page' : 'taken back'} (Escape).`);
    }

    /** Recomputes isEnabled from its inputs and tidies up the ring if needed. */
    applyEnabledState() {
        const wasEnabled = this.isEnabled;
        this.isEnabled = this.userEnabled && !this.isExcluded && !this.isSuspended;

        if (wasEnabled === this.isEnabled) return;

        if (!this.isEnabled) {
            // Turned off while the page is open: drop the ring immediately rather
            // than leaving a stale highlight behind.
            this.isActiveMode = false;
            if (this.spotlight) this.spotlight.style.display = 'none';
            if (this.isMenuOpen) this.closeMenu();
        }

        console.log(`[TUI] ${this.isEnabled ? 'Enabled' : 'Disabled'}` +
            (this.isExcluded ? ' (site is on the excluded list)' : ''));

        // Deliberately not broadcastStatus(): background counts every
        // STATUS_UPDATE as a page load, and a settings flip is not one.
        this.safeSendMessage({
            type: 'STATUS_CHANGED',
            payload: { supported: true, enabled: this.isEnabled }
        });
    }

    /**
     * The address-bar hostname, resolved once. It cannot change without the
     * content script being torn down and re-injected, so caching it keeps the
     * storage listener from making a background round-trip on every edit.
     */
    async resolveHostname() {
        if (this.hostnameResolved) return this.currentHostname;

        let hostname = this.getTopHostname();
        if (!hostname) hostname = await this.getTopHostnameFromBackground();

        this.currentHostname = hostname;
        this.hostnameResolved = true;
        return hostname;
    }

    async refreshExclusion() {
        const hostname = await this.resolveHostname();

        if (!window.TuiSiteRules) {
            // site-rules.js is listed ahead of this file in the manifest, so this
            // only happens if that entry is dropped. Fail open rather than silently
            // ignoring the user's exclusions without a trace.
            console.warn('[TUI] site-rules.js did not load; excluded sites are not applied.');
            this.isExcluded = false;
        } else {
            this.isExcluded = window.TuiSiteRules.isExcluded(hostname, this.excludedSites);
        }

        this.applyEnabledState();
    }

    async loadSettings() {
        const localStorage = await chrome.storage.local.get([
            'tuiEnabled', 'tuiExcludedSites',
            'tuiRingColor', 'tuiRingWidth', 'tuiRingFill', 'tuiMotion'
        ]);
        this.userEnabled = localStorage.tuiEnabled !== false;
        this.excludedSites = Array.isArray(localStorage.tuiExcludedSites)
            ? localStorage.tuiExcludedSites
            : [];
        this.ringColor = localStorage.tuiRingColor || null;
        this.ringWidth = localStorage.tuiRingWidth ?? null;
        this.ringFill = localStorage.tuiRingFill !== false;
        this.motion = localStorage.tuiMotion || null;
        this.applyRingColor();
        await this.refreshExclusion();

        try {
            const sessionStorage = await chrome.storage.session.get(['tuiAdminMode']);
            this.debugMode = !!sessionStorage.tuiAdminMode;
            if (this.debugMode) {
                this.logBuffer = [];
                this._startLogCapture();
            }
        } catch (e) {
            console.warn('[TUI] Failed to access session storage (likely restricted context):', e);
            this.debugMode = false;
        }
    }

    handleScroll() {
        this.scheduleRingUpdate();
    }

    /**
     * Scrolls the element back into view when the page pushed it out right
     * after the ring arrived. On CNN an ad loads above a story a moment after
     * ArrowDown lands on it and moves it below the fold, so the ring the user
     * just moved is out of sight. Later shifts are left alone: by then the
     * user may be scrolling with the mouse and pulling the page back would
     * fight them.
     */
    keepArrivalInView(el) {
        const ARRIVAL_WINDOW_MS = 2000;
        if (!this.lastArrivalAt || Date.now() - this.lastArrivalAt > ARRIVAL_WINDOW_MS) return;

        const rect = el.getBoundingClientRect();
        const outOfView = rect.bottom > window.innerHeight || rect.top < 0;
        // Taller than the window: it cannot fit, and 'nearest' would jitter.
        if (!outOfView || rect.height > window.innerHeight) return;
        el.scrollIntoView({ behavior: this.scrollBehavior(), block: 'nearest' });
    }

    /**
     * Puts the ring back on its element, at most once a frame. layoutShifted
     * is false for a scroll, which moves the ring but never re-scrolls:
     * a smooth scroll in progress would otherwise be restarted every frame.
     */
    scheduleRingUpdate(layoutShifted = false) {
        if (layoutShifted) this._layoutShifted = true;
        if (!this.isEnabled) return;

        // Throttled update using requestAnimationFrame to avoid performance hits during scroll
        if (!this._scrollFrameLocked) {
            this._scrollFrameLocked = true;
            requestAnimationFrame(() => {
                this._scrollFrameLocked = false;
                const shifted = this._layoutShifted;
                this._layoutShifted = false;
                // Only update visual position if we are in "Active Mode" and have a target
                // that is still on the page (a removed one would put the ring at 0,0).
                if (this.isActiveMode && this.lastActiveElement && this.lastActiveElement.isConnected) {
                    this.highlight(this.lastActiveElement);
                    if (shifted) this.keepArrivalInView(this.lastActiveElement);
                }
            });
        }
    }

    handleKeydown(e) {
        // Escape hands the keyboard back to the page, and takes it again. Read
        // before the enabled check, because once the keyboard is handed over the
        // engine is disabled and would otherwise have no way to hear the key that
        // takes it back. Never preventDefault here: Escape belongs to the page
        // too, and swallowing it would trade one stolen key for another.
        if (e.key === 'Escape' && this.canToggleHandover()) {
            this.setSuspended(!this.isSuspended);
            return;
        }

        if (!this.isEnabled) return;

        // User is interacting, stop any pending focus monitoring to avoid conflicts/lag
        this.stopFocusMonitor();

        if (e.key === 'F10' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            this.toggleMenu();
            return;
        }

        if (this.isMenuOpen) {
            this.handleMenuNavigation(e);
            return;
        }

        // Ignore if user is typing in an input
        const active = document.activeElement;

        // BUG FIX: Only trap navigation if the input actually USES arrow keys (Text, Select, etc.)
        // Simple buttons (submit, reset, button) should NOT trap navigation.
        if (this.shouldTrapArrows(active)) {
            if (e.key === 'Escape') {
                // Return focus to wrapper if possible, otherwise blur
                const parent = active.parentElement;
                if (parent && parent.hasAttribute('tabindex')) {
                    parent.focus();
                } else {
                    active.blur();
                }
                e.preventDefault();
                e.stopImmediatePropagation(); // Ensure page doesn't do anything else with Escape
            }
            return;
        }

        if (e.key === 'Home' || e.key === 'End') {
            // Ctrl+End is "end of document" and Shift+Home selects. Those belong
            // to the page, so anything with a modifier passes straight through.
            if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
            if (!window.TuiLineRules) return;

            const direction = window.TuiLineRules.directionFor(e.key, this.lastDirection);
            if (!direction) return;

            e.preventDefault();
            e.stopImmediatePropagation();
            this.navigate(direction, 'extreme');
            return;
        }

        if (e.key && e.key.startsWith('Arrow')) {
            // We handle this navigation action
            e.preventDefault();
            e.stopImmediatePropagation(); // CRITICAL: Stop the page from seeing this key
            this.navigate(e.key);
        } else if (e.key === 'Enter') {
            const active = document.activeElement;

            // Check if we are on a wrapper that has a stashed input
            // CRITICAL: Also check lastActiveElement in case focus is on body (contenteditable fix)
            const wrapper = (active && active._tui_input) ? active :
                (this.lastActiveElement && this.lastActiveElement._tui_input) ? this.lastActiveElement :
                    null;

            if (wrapper && wrapper._tui_input) {
                e.preventDefault();
                e.stopImmediatePropagation();

                const input = wrapper._tui_input;
                input.focus();

                // Special handling for SELECT elements
                // Open the dropdown immediately and exit navigation mode
                // so arrow keys work naturally inside the dropdown
                if (input.tagName === 'SELECT') {
                    // Open the dropdown
                    input.click();

                    // Exit navigation mode so the green ring disappears
                    // and arrow keys are passed through to the SELECT
                    this.isActiveMode = false;
                    if (this.spotlight) this.spotlight.style.display = 'none';
                }

                return;
            }

            // ROBUST CLICK SIMULATION
            // Many modern web apps (React, etc) listen to mousedown/mouseup or require the full event chain.
            // Simple .click() often fails on div/span elements acting as buttons.
            e.preventDefault();
            e.stopImmediatePropagation();
            if (active) {
                this.simulateClick(active);
                this.safeSendMessage({ type: 'METRIC_EVENT', payload: { action: 'ENTER', key: 'Enter' } });
            }
        }
    }

    /**
     * A one-line description of an element for the debug log. Logging the
     * element itself is useless in a downloaded report: the capture serialises
     * a DOM node as "{}", which is what a click that went nowhere looks like.
     */
    describeElement(el) {
        if (!el) return 'null';
        const tag = el.tagName || '?';
        const id = el.id ? `#${el.id}` : '';
        const cls = (typeof el.className === 'string' && el.className.trim())
            ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
        const href = (el.tagName === 'A' && el.getAttribute('href')) ? ` href=${el.getAttribute('href')}` : '';
        return `${tag}${id}${cls}${href}`;
    }

    simulateClick(el) {
        if (this.debugMode) console.log('[TUI] Simulating Click on:', this.describeElement(el));

        // SMART TARGETING: the focused element is often not the element that
        // does the work. A list row keeps the tabindex while the link inside it
        // carries the href, and clicking the row does nothing at all.
        // click-rules.js decides; _tui_activate is the element navigation was
        // aiming at when the browser bounced focus up to this container.
        let target = el;
        const intended = (el._tui_activate && document.body.contains(el._tui_activate))
            ? el._tui_activate : null;

        if (window.TuiClickRules) {
            target = window.TuiClickRules.resolveClickTarget(el, intended) || el;
            if (this.debugMode && target !== el) {
                console.log('[TUI] Retargeting click to:', this.describeElement(target),
                    intended === target ? '(intended by navigation)' : '(container action)');
            }
        }

        const options = {
            view: window,
            bubbles: true,
            cancelable: true,
            composed: true,  // Allow events to cross shadow DOM boundaries
            buttons: 1,
            pointerType: 'mouse'  // Explicitly mark as mouse event (not pen/touch)
        };

        if (this.debugMode) console.log('[TUI] Dispatching synthetic events...');

        // 1. Dispatch generic Down/Up events first (required for some UI frameworks)
        // Standard sequence: pointerdown -> mousedown -> pointerup -> mouseup -> click
        target.dispatchEvent(new PointerEvent('pointerdown', options));
        target.dispatchEvent(new MouseEvent('mousedown', options));
        target.dispatchEvent(new PointerEvent('pointerup', options));
        target.dispatchEvent(new MouseEvent('mouseup', options));

        // 2. Perform the Click
        // Use native click() if available as it effectively triggers the 'click' event 
        // AND handles default behaviors (like navigation for <a> tags).
        if (typeof target.click === 'function') {
            if (this.debugMode) console.log('[TUI] Calling native .click()');
            target.click();
        } else {
            // Fallback for elements without .click() (e.g., SVG in some contexts)
            if (this.debugMode) console.log('[TUI] Dispatching synthetic click event');
            target.dispatchEvent(new MouseEvent('click', options));
        }

        if (this.debugMode) console.log('[TUI] Click simulation complete.');
    }

    handleInteraction(e) {
        // Sync internal state with system focus on user interactions
        if (!this.isEnabled) return;

        // Disable "Active Mode" on mouse interaction so the green ring doesn't annoy mouse users
        if (e.type === 'mousedown' || e.type === 'click') {
            this.isActiveMode = false;
            // Immediate update to hide the ring
            if (this.lastActiveElement) this.highlight(this.lastActiveElement);
        }

        // Use the monitor to catch immediate or slightly delayed focus changes
        this.monitorFocusChange(500);
    }

    stopFocusMonitor() {
        if (this.focusMonitorInterval) {
            clearInterval(this.focusMonitorInterval);
            this.focusMonitorInterval = null;
        }
    }

    monitorFocusChange(duration = 500) {
        this.stopFocusMonitor(); // Reset existing to prevent overlap

        let elapsed = 0;
        const interval = 50;

        this.focusMonitorInterval = setInterval(() => {
            elapsed += interval;
            if (elapsed >= duration) {
                this.stopFocusMonitor();
                return;
            }

            const active = document.activeElement;
            // Check if focus has moved to a new meaningful element
            if (active && active !== this.lastActiveElement && active !== document.body) {
                // Ignore large layout wrappers that just confuse the user (e.g. WhatsApp Web background)
                if (this.isLayoutWrapper(active)) {
                    return;
                }

                this.lastActiveElement = active;
                this.highlight(active);
                // Once found, we can stop polling to save resources
                this.stopFocusMonitor();
            }
        }, interval);
    }

    /**
     * Main Navigation Logic
     */
    navigate(key, mode) {
        if (this.isNavigating) return;
        this.isNavigating = true;

        // ENABLE Active Mode: The user clearly wants to use the plugin now.
        // This will allow highlight() to actually render the green ring.
        this.isActiveMode = true;

        if (this.debugMode) {
            const active = this.lastActiveElement || document.activeElement;
            const tag = active ? active.tagName : 'NULL';
            const id = active && active.id ? `#${active.id}` : '';
            let cls = '';
            if (active && typeof active.className === 'string') {
                cls = `.${active.className.split(' ').join('.')}`;
            }
            console.log(`%c[TUI] Navigating ${key} from ${tag}${id}${cls}`, 'color: cyan; font-weight: bold;');
        }

        // AUTO-RETRY LOOP
        // If focus fails (phantom element), we try again immediately with the next best candidate.
        // Limit to 5 attempts to prevent infinite loops or performance issues.
        let attempts = 0;
        const maxAttempts = 5;
        let success = false;

        while (attempts < maxAttempts && !success) {
            attempts++;
            if (attempts > 1 && this.debugMode) {
                console.log(`[TUI] Navigation Retry Attempt ${attempts}/${maxAttempts}`);
            }

            // 1. Discovery
            // Only strictly needed on first attempt or if we want to be very safe,
            // but refreshing candidates is relatively cheap if dirty flag is managed.
            this.refreshCandidates();

            // 2. Current Position - PREFER internal tracking
            if (this.debugMode) {
                const lae = this.lastActiveElement;
                console.log('[TUI NAV] lastActiveElement:', lae ? `${lae.tagName}#${lae.id}` : 'null',
                    '| _tui_input:', lae?._tui_input ? `${lae._tui_input.tagName}#${lae._tui_input.id}` : 'none');
            }
            let current = this.lastActiveElement;
            if (!current || !document.body.contains(current)) {
                current = document.activeElement;
            }

            // Clear stale wrapper state if the wrapper is no longer focused.
            // This handles popup close/reopen: _tui_input persists on the DOM node,
            // causing SELECT to be wrongly excluded on the next navigation.
            if (current && current._tui_input && current !== document.activeElement) {
                current._tui_input = null;
                current = document.activeElement;
            }

            let currentRect = null;
            if (current && current !== document.body && !this.isLayoutWrapper(current)) {
                currentRect = current.getBoundingClientRect();
            }

            // 3. Find Best Candidate
            // Note: findBestCandidate automatically filters out elements in this.failedFocusElements
            const target = this.findBestCandidate(currentRect, key, current, mode);

            // 4. Action
            if (target) {
                // Try to focus. access result to see if we should stop or retry.
                const focusResult = this.focusElement(target, attempts);

                if (focusResult) {
                    success = true;
                    // Remember the axis for Home/End. A jump counts the same as a
                    // step: both leave the ring travelling in that direction.
                    this.lastDirection = key;
                    this.lastArrivalAt = Date.now();
                    // Metric Tracking
                    this.safeSendMessage({
                        type: 'METRIC_EVENT',
                        payload: { action: 'NAVIGATE', key: key }
                    });
                } else {
                    // Focus failed. The element was added to failedFocusElements inside focusElement().
                    // The loop will continue, and findBestCandidate will skip this element next time.
                    if (this.debugMode) console.log(`[TUI] Focus failed (Attempt ${attempts}/${maxAttempts}). Retrying navigation...`);
                }
            } else if (mode === 'extreme') {
                // Home/End stop at the end of the line rather than scrolling on.
                // Scrolling here would turn a second press into a page-down,
                // which is not what the key was asked to do.
                success = true;
            } else {
                // 5. Off-screen handling (scroll) - Only if NO candidate found
                this.handleOffScreen(key);
                success = true; // Treat scroll as "success" to stop retrying
                // Metric Tracking
                this.safeSendMessage({
                    type: 'METRIC_EVENT',
                    payload: { action: 'SCROLL', key: key }
                });
            }
        }

        // Reset lock
        requestAnimationFrame(() => this.isNavigating = false);
    }

    /**
     * Checks if an element is likely a layout wrapper (full screen, often inadvertent target).
     */
    isLayoutWrapper(el) {
        if (!el || el === document.body || el === document.documentElement) return false;

        const rect = el.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // If it covers almost the entire screen (>95% width AND >95% height)
        // AND it doesn't have semantic importance (like a video player or main text area might,
        // but typically those focus internal controls or are contenteditable).
        if (rect.width >= viewportWidth * 0.95 && rect.height >= viewportHeight * 0.95) {
            return true;
        }
        return false;
    }

    /**
     * Checks if an element or its ancestors are fixed/sticky.
     */
    isSticky(el) {
        let iter = el;
        while (iter && iter !== document.body) {
            const style = window.getComputedStyle(iter);
            if (style.position === 'fixed' || style.position === 'sticky') {
                return true;
            }
            iter = iter.parentElement;
        }
        return false;
    }

    /**
     * Determines if an element should "trap" arrow keys, preventing TUI navigation.
     * Returns TRUE for inputs where arrows stick/move cursor (Text, Select, Range).
     * Returns FALSE for inputs that act like buttons (Submit, Button, Checkbox).
     */
    shouldTrapArrows(el) {
        if (!el) return false;

        const tagName = el.tagName;
        if (tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
        if (el.isContentEditable) return true;

        if (tagName === 'INPUT') {
            const type = el.type ? el.type.toLowerCase() : 'text';

            // These types use arrows for internal logic (cursor movement, value change)
            const trapTypes = [
                'text', 'search', 'password', 'email', 'url', 'tel',
                'number', 'date', 'month', 'week', 'time', 'datetime-local',
                'color', 'range', 'radio'
            ];

            return trapTypes.includes(type);
        }

        return false;
    }

    /**
     * Detects auxiliary UI elements that shouldn't be navigation targets.
     * These are elements added by UI frameworks for visual/accessibility purposes
     * but aren't meant for direct keyboard navigation.
     */
    isAuxiliaryElement(el) {
        // BUG FIX: Semantic interactive elements should NEVER be treated as auxiliary,
        // even if they contain classes like "ripple" or "focus-indicator".
        // This fixes issues where buttons with visual effects (e.g. Gemini New Chat) were ignored.
        const semanticInteractive = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'];
        if (semanticInteractive.includes(el.tagName)) {
            return false;
        }

        const classNames = el.className;

        // Check 1: Common auxiliary class name patterns
        const auxiliaryPatterns = [
            'touch-target',
            'ripple',
            'overlay',
            'focus-indicator',
            'persistent-ripple',
            'button-ripple',
            'mat-ripple',
            'backdrop',
            'underlay',
            'highlight'
        ];

        if (typeof classNames === 'string') {
            const lowerClass = classNames.toLowerCase();
            if (auxiliaryPatterns.some(pattern => lowerClass.includes(pattern))) {
                return true;
            }
        }

        // Check 2: Element with no meaningful content
        const hasText = el.textContent && el.textContent.trim().length > 0;
        const hasAriaLabel = el.hasAttribute('aria-label') && el.getAttribute('aria-label').trim().length > 0;
        const hasVisibleChildren = el.querySelectorAll('img, svg, mat-icon, [role="img"]').length > 0;

        if (!hasText && !hasAriaLabel && !hasVisibleChildren) {
            // Empty element - check if it's positioned over a focusable parent/sibling
            const style = window.getComputedStyle(el);
            const position = style.position;

            if (position === 'absolute' || position === 'fixed') {
                // Check if parent or previous sibling is also focusable
                const parent = el.parentElement;
                if (parent) {
                    const parentIsFocusable = parent.matches('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
                    if (parentIsFocusable) {
                        return true; // Likely a touch target over the parent
                    }

                    // Check previous sibling
                    const prevSibling = el.previousElementSibling;
                    if (prevSibling) {
                        const siblingIsFocusable = prevSibling.matches('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
                        if (siblingIsFocusable) {
                            return true; // Likely a touch target near the sibling
                        }
                    }
                }
            }
        }

        return false;
    }

    refreshCandidates() {
        if (!this.candidatesDirty) return;

        // Step A: Candidate Discovery
        // 1. Semantic Elements & Potential Targets
        // NOTE: We MUST include tabindex="-1" because many modern apps (like WhatsApp) manage focus programmatically
        // on list items using roving tabindex, usually setting them to -1 when not active.
        // NOTE: We include 'label' because modern UIs use labels as interactive controls (dropdowns, custom checkboxes, toggles)
        const selector = 'a, button, input, select, textarea, label, iframe, frame, object, embed, summary, [tabindex], [contenteditable]:not([contenteditable="false"])';
        let all = Array.from(document.querySelectorAll(selector));

        // Items of a tree, listbox or menu whose container keeps the only
        // tabindex (Google Drive's sidebar). They have no tabindex, so the
        // search above misses them. focusElement gives them one on arrival.
        const targetRules = window.TuiTargetRules;
        if (targetRules) {
            const known = new Set(all);
            document.querySelectorAll(targetRules.OWNED_ITEM_SELECTOR).forEach(item => {
                const target = targetRules.ownedItemTarget(item);
                if (!target || known.has(target)) return;
                target._tui_owned_item = true;
                known.add(target);
                all.push(target);
            });
        }

        // 2. Filter candidates
        this.candidates = all.filter(el => {
            // Visibility Check
            if (el.offsetParent === null) {
                return false; // Hidden parent
            }

            const rect = el.getBoundingClientRect();

            // FILTER: Negative Tabindex on native controls (unless part of a widget)
            // This excludes helper inputs used by libraries (e.g. Jira, React-Select)
            if (el.getAttribute('tabindex') === '-1') {
                // Allow if currently focused (user is already there)
                if (document.activeElement !== el) {
                    const tagName = el.tagName;
                    if (['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'A'].includes(tagName)) {
                        // Check for Roving Tabindex roles that SHOULD be reachable via arrow keys
                        const role = el.getAttribute('role');
                        const rovingRoles = ['menuitem', 'menuitemradio', 'menuitemcheckbox', 'option', 'gridcell', 'tab', 'treeitem', 'listitem'];
                        if (!role || !rovingRoles.includes(role)) {
                            // Also allow if this element is part of a roving tabindex group
                            // (e.g. WhatsApp navbar buttons inside <header tabindex="0">)
                            if (!this.isRovingTabindexMember(el)) {
                                return false;
                            }
                        }
                    }
                }
            }

            // FILTER: Tiny elements (1px spacing hacks, etc.)
            // Skip links are often 1x1 pixels. We require a minimum interactive size.
            if (rect.width < 4 || rect.height < 4) {
                return false;
            }

            // Computed style check (expensive, maybe optimize later if slow)
            const style = window.getComputedStyle(el);
            const opacity = parseFloat(style.opacity);
            if (style.display === 'none' || style.visibility === 'hidden' || opacity < 0.05) {
                return false;
            }

            // FILTER: Parent explicitly marked as non-focusable (often hides internal inputs)
            // This fixes Jira resize handles where a SPAN[tabindex="-1"] wraps a hidden INPUT
            if (el.parentElement && el.parentElement.getAttribute('tabindex') === '-1') {
                // Exception: TUI itself set this wrapper (shouldTrapArrows pattern).
                // parent._tui_input === el means we own this tabindex, so never filter it.
                if (el.parentElement._tui_input === el) {
                    // allow through
                } else if (!el.isContentEditable) {
                    // Exception: contenteditable elements inside a tabindex=-1 wrapper are REAL
                    // interactive inputs (e.g. Telegram's message box). The wrapper uses tabindex=-1
                    // purely for programmatic focus management — not to hide the element.
                    // Never filter these out; they are valid navigation targets.
                    const parentRole = el.parentElement.getAttribute('role');
                    const validParentRoles = ['row', 'grid', 'list', 'menu', 'menubar', 'tablist', 'treegrid'];
                    if (!parentRole || !validParentRoles.includes(parentRole)) {
                        if (this.debugMode && ['SELECT', 'INPUT', 'TEXTAREA'].includes(el.tagName)) {
                            console.log('[TUI FILTER] Dropping', el.tagName, el.id || '', '— parent tabindex=-1, _tui_input:', el.parentElement._tui_input || 'NOT SET');
                        }
                        return false;
                    }
                }
            }

            // FILTER: Tiny inputs (often used for focus traps or file uploads)
            if (el.tagName === 'INPUT') {
                const type = el.type ? el.type.toLowerCase() : 'text';
                // Removed 'range' from specific exclusions - visible sliders should be > 10px
                if (type !== 'checkbox' && type !== 'radio') {
                    if (rect.width < 10 || rect.height < 10) {
                        return false;
                    }
                }
            }

            // FILTER: Clipped elements (Accessibly Hidden pattern)
            // Many sites use clip: rect(0 0 0 0) or clip-path to hide skip links visually
            if (style.clip === 'rect(0px, 0px, 0px, 0px)' ||
                style.clip === 'rect(0 0 0 0)' ||
                style.clipPath === 'inset(50%)' ||
                (style.width === '1px' && style.height === '1px' && style.overflow === 'hidden')) {
                return false;
            }

            // FILTER: "Skip to Content" text check
            // If the element text explicitly says "Skip to", it's likely a hidden navigation aid.
            // These should only be candidates if they are ALREADY focused (i.e. user Tabbed to them).
            if (document.activeElement !== el) {
                const text = (el.textContent || '').toLowerCase().trim();
                if (text.startsWith('skip to ') || text === 'skip navigation' || text === 'skip main navigation') {
                    return false;
                }
            }

            // Details/Summary Check
            const details = el.closest('details');
            if (details && !details.open) {
                // If details is closed, only the summary (and elements inside it) should be visible
                const summary = details.querySelector('summary');
                if (summary && (el === summary || summary.contains(el))) {
                    // It's the summary or inside it -> OK
                } else {
                    return false; // Hidden content inside closed details
                }
            }

            // Near enough to the screen to be worth navigating to?
            // Not the viewport exactly: the next row down a column usually sits
            // just past the bottom edge, and clipping it there made ArrowDown
            // leave the column for whatever sidebar item happened to be visible.
            // See view-rules.js for why the band reaches past top and bottom but
            // not past the sides.
            if (window.TuiViewRules) {
                if (!window.TuiViewRules.withinReach(rect)) return false;
            } else if (rect.bottom < 0 || rect.top > window.innerHeight ||
                       rect.right < 0 || rect.left > window.innerWidth) {
                return false;
            }

            // Exclude aria-hidden elements (decorative dividers, spacers, etc.)
            // EXCEPTION: Allow LABELs with aria-hidden since they often control inputs
            // in modern accessibility patterns (prevents duplicate screen reader announcements)
            if (el.getAttribute('aria-hidden') === 'true') {
                // Labels with 'for' attribute are functional, not decorative
                if (el.tagName === 'LABEL' && el.hasAttribute('for')) {
                    // Keep this label - it controls an input
                } else {
                    return false;  // Filter out other aria-hidden elements
                }
            }

            // Exclude "show-on-focus" skip links (accessibility pattern)
            // These elements are only visible when focused via Tab key and should not be
            // part of spatial navigation candidates
            const classNames = el.className;
            if (typeof classNames === 'string') {
                const lowerClass = classNames.toLowerCase();
                if (lowerClass.includes('show-on-focus') ||
                    lowerClass.includes('skip-to') ||
                    lowerClass.includes('skip-link') ||
                    lowerClass.includes('jump-link') ||      // Wikipedia pattern
                    lowerClass.includes('jump-to') ||        // Variation
                    lowerClass.includes('sr-only-focusable')) {
                    return false;
                }
            }

            // Filter out auxiliary UI elements (touch targets, ripples, overlays, etc.)
            if (this.isAuxiliaryElement(el)) {
                return false;
            }

            // Ad slots on news sites (see target-rules.js).
            if (targetRules && targetRules.isAdFrame(el)) {
                return false;
            }

            // CRITICAL FIX: Stricter LABEL filtering
            // Labels are only interactive if:
            // 1. They have a tabindex (custom implementation)
            // 2. They point to a valid, focusable input (native behavior)
            if (el.tagName === 'LABEL') {
                const hasTabindex = el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1';
                if (hasTabindex) return true; // Explicitly interactive

                const forId = el.getAttribute('for');
                if (forId) {
                    const targetInput = document.getElementById(forId);
                    if (targetInput) {
                        // Check if target is focusable
                        const targetStyle = window.getComputedStyle(targetInput);
                        const targetRect = targetInput.getBoundingClientRect();

                        // If target is hidden, disabled, or not focusable, the label is useless
                        if (targetInput.disabled ||
                            targetStyle.display === 'none' ||
                            targetStyle.visibility === 'hidden' ||
                            targetInput.getAttribute('type') === 'hidden' ||
                            targetInput.getAttribute('aria-hidden') === 'true' ||
                            targetRect.width === 0 || targetRect.height === 0 ||
                            targetInput.getAttribute('tabindex') === '-1') {
                            return false;
                        }
                        // Target is valid -> Keep label (it will redirect focus)
                        return true;
                    }
                }
                // No tabindex and no valid target -> Skip (it's just text)
                return false;
            }

            // NOTE: BUTTON[tabindex="-1"] is already handled by Filter 1 above
            // (which now also detects roving tabindex group members via isRovingTabindexMember).

            // FILTER: Elements that are explicitly aria-hidden
            // (Unless they are labels, which we handled above)
            if (el.getAttribute('aria-hidden') === 'true') {
                return false;
            }


            // NEW: Interactive Validation for Generic Elements
            // Many web apps use tabindex on wrapper divs for focus management,
            // but these aren't actually clickable. We need to validate them.
            // Custom elements count as generic too (see target-rules.js).
            const isGenericElement = targetRules
                ? targetRules.isGenericTag(el)
                : ['DIV', 'SPAN', 'LI', 'TR', 'TD', 'UL', 'OL', 'NAV', 'SECTION', 'ARTICLE', 'ASIDE', 'HEADER', 'FOOTER', 'MAIN'].includes(el.tagName);

            if (isGenericElement && el.hasAttribute('tabindex')) {
                // If it's a semantic interactive element, always keep it
                if (['INPUT', 'TEXTAREA', 'IFRAME', 'BUTTON', 'A', 'SELECT', 'SUMMARY'].includes(el.tagName)) {
                    // Keep native interactive elements
                } else {
                    // It's a generic element with tabindex.
                    // Check if it LOOKS clickable or has interactive role
                    // Includes a row of a grid, such as a file in Drive's list.
                    const hasInteractiveRole = targetRules
                        ? targetRules.hasInteractiveRole(el)
                        : ['button', 'link', 'menuitem', 'tab', 'option', 'treeitem', 'gridcell', 'listitem'].includes(el.getAttribute('role'));
                    const looksClickable = style.cursor === 'pointer';

                    // Exception: allow wrapper divs that contain a contenteditable (e.g. Telegram's
                    // div.input-message-container[tabindex="-1"]).  These are genuine text-input containers
                    // whose cursor is 'text', not 'pointer', so they'd be wrongly rejected by the checks
                    // above.  Pressing Enter on such a wrapper will simulate a click, which naturally
                    // focuses the inner contenteditable so the user can type.
                    const containsEditable = !hasInteractiveRole && !looksClickable &&
                        !!el.querySelector('[contenteditable]:not([contenteditable="false"])');

                    if (!hasInteractiveRole && !looksClickable && !el.isContentEditable && !containsEditable) {
                        // It's a generic wrapper with tabindex but no interactive indicators.
                        // REJECT IT to avoid noise (large containers, focus traps, etc.)
                        return false;
                    }

                    // Reject large containers regardless of which indicator let them through
                    // (cursor:pointer inheritance OR containsEditable deep inside).
                    // The containsEditable exception was designed for small wrappers like Telegram's
                    // message input div — NOT for whole-column containers that happen to have a
                    // compose box buried inside. Real interactive widgets fit well within 20% of the
                    // viewport; full-column/page containers (Twitter timeline, feed sections) do not.
                    if (!hasInteractiveRole && !el.isContentEditable) {
                        const viewportArea = window.innerWidth * window.innerHeight;
                        if (rect.width * rect.height > viewportArea * 0.2) {
                            return false;
                        }
                    }
                }
            }

            return true;
        });

        this.candidatesDirty = false;
        if (this.debugMode) console.log(`[TUI Spatial] Candidates refreshed: ${this.candidates.length}`);

        // [DEBUG] Trace every element that IS or CONTAINS a contenteditable.
        // Shows whether it made it into the candidate list, and if not, at which filter it was killed.
        if (this.debugMode) {
            const editableParents = new Set();
            document.querySelectorAll('[contenteditable]:not([contenteditable="false"])').forEach(ce => {
                if (ce.offsetParent !== null) {
                    editableParents.add(ce);          // the contenteditable itself
                    if (ce.parentElement) editableParents.add(ce.parentElement); // its container
                }
            });

            editableParents.forEach(el => {
                const survived = this.candidates.includes(el);
                const rect = el.getBoundingClientRect();
                const tag = el.tagName;
                const cls = el.className && typeof el.className === 'string' ? el.className : '';
                const ti = el.getAttribute('tabindex') ?? '(none)';
                const ce = el.isContentEditable ? 'yes' : 'no';
                const containsEditable = !el.isContentEditable && !!el.querySelector('[contenteditable]:not([contenteditable="false"])');
                const parentTI = el.parentElement ? (el.parentElement.getAttribute('tabindex') ?? '(none)') : 'N/A';
                const role = el.getAttribute('role') ?? '(none)';
                const cursor = window.getComputedStyle(el).cursor;
                console.log(
                    `[TUI INPUT-TRACE] ${survived ? '✅ CANDIDATE' : '❌ FILTERED'} | ` +
                    `${tag}.${cls.split(' ').join('.')} | ` +
                    `tabindex=${ti} role=${role} contenteditable=${ce} containsEditable=${containsEditable} | ` +
                    `cursor=${cursor} | parentTabindex=${parentTI} | ` +
                    `rect: L${rect.left.toFixed(0)} R${rect.right.toFixed(0)} T${rect.top.toFixed(0)} B${rect.bottom.toFixed(0)} W${rect.width.toFixed(0)} H${rect.height.toFixed(0)}`
                );
            });
        }
    }

    findBestCandidate(currentRect, key, currentEl, mode) {
        if (!currentRect) {
            // Corner case: No focus. Pick top-left most visible element or first one.
            // If we have no origin, we can't do directional relative navigation effectively.
            // Fallback: Pick the first candidate in the list (usually top-left in DOM order).
            // Candidates now reach past the fold, so prefer one the user can see
            // before falling back to the first of them.
            const visible = window.TuiViewRules
                ? this.candidates.find(c => window.TuiViewRules.onScreen(c.getBoundingClientRect()))
                : null;
            return visible || (this.candidates.length > 0 ? this.candidates[0] : null);
        }

        // Special case: ArrowDown from an open SUMMARY → enter popup in DOM order
        if (key === 'ArrowDown' && currentEl && currentEl.tagName === 'SUMMARY') {
            const details = currentEl.parentElement;
            if (details && details.tagName === 'DETAILS' && details.open) {
                const firstDescendant = this.candidates.find(
                    c => c !== currentEl && details.contains(c)
                );
                if (firstDescendant) return firstDescendant;
            }
        }

        let bestCandidate = null;
        let minScore = Infinity;

        // Determine if we are currently starting from a sticky/fixed context (e.g. Header)
        // BUG FIX: Also treat semantic navigation regions (HEADER, NAV) as "Sticky/Anchor" regions.
        // This ensures that navigating FROM a header (even if not CSS sticky) to a sticky sidebar doesn't incur a penalty.
        const currentIsSticky = currentEl ? (this.isSticky(currentEl) || !!currentEl.closest('header, nav, [role="banner"], [role="navigation"]')) : false;

        this.candidates.forEach(cand => {
            // Skip self - ENHANCED to prevent navigation loops
            // Check multiple conditions:
            // 1. Don't select lastActiveElement (tracked wrapper)
            if (cand === this.lastActiveElement) {
                return;
            }

            // 2. Don't select the actual DOM focused element
            if (cand === document.activeElement) {
                return;
            }

            // 3. If lastActiveElement is a wrapper with a child input, skip both wrapper AND child
            if (this.lastActiveElement && this.lastActiveElement._tui_input) {
                if (cand === this.lastActiveElement._tui_input) {
                    if (this.debugMode && ['SELECT', 'INPUT', 'TEXTAREA'].includes(cand.tagName)) {
                        console.log('[TUI SKIP] Skipping', cand.tagName, cand.id || '', '— it is lastActiveElement._tui_input (wrapper already active)');
                    }
                    return;
                }
            }

            // 4. Don't select currentEl if it was passed explicitly
            if (currentEl) {
                if (cand === currentEl) return;

                // CRITICAL FIX: Don't select ANCESTORS of the current element
                // Navigating from Input -> Parent Div/Label is almost never desired and causes loops
                if (cand.contains(currentEl)) return;

                // CRITICAL FIX: Don't select LABELs that control the current input
                if (cand.tagName === 'LABEL' && cand.getAttribute('for') === currentEl.id) return;
            }

            // 5. Skip elements that recently failed to receive focus
            if (this.failedFocusElements.has(cand)) {
                if (this.debugMode) console.log('[TUI] Skipping element that previously failed to focus:', cand.tagName, cand.className);
                return;
            }

            const rect = cand.getBoundingClientRect();

            // Step B: Spatial Filtering (Cone of Vision / Quarter Plane)
            let isValid = false;

            switch (key) {
                case 'ArrowRight':
                    isValid = rect.left >= currentRect.right - 5;
                    break;
                case 'ArrowLeft':
                    isValid = rect.right <= currentRect.left + 5;
                    break;
                case 'ArrowDown':
                    isValid = rect.top >= currentRect.bottom - 5;
                    break;
                case 'ArrowUp':
                    isValid = rect.bottom <= currentRect.top + 5;
                    break;
            }

            if (this.debugMode && (cand.id === 'vector-main-menu-dropdown-label' || cand.id === 'vector-main-menu-dropdown-checkbox')) {
                console.log(`[TUI DEBUG CONE] Direction: ${key}, IsValid: ${isValid}`);
                console.log(`- Logic (${key}): Rect[${rect.left}, ${rect.right}, ${rect.top}, ${rect.bottom}] vs Current[${currentRect.left}, ${currentRect.right}, ${currentRect.top}, ${currentRect.bottom}]`);
            }

            // [DEBUG] Spatial trace for contenteditable-related elements
            if (this.debugMode && (cand.isContentEditable || !!cand.querySelector?.('[contenteditable]:not([contenteditable="false"])'))) {
                const cls = cand.className && typeof cand.className === 'string' ? cand.className : '';
                console.log(
                    `[TUI INPUT-TRACE SPATIAL] ${cand.tagName}.${cls.split(' ').join('.')} | ` +
                    `direction=${key} isValid=${isValid} | ` +
                    `candRect: L${rect.left.toFixed(0)} T${rect.top.toFixed(0)} | ` +
                    `currentRect: R${currentRect.right.toFixed(0)} B${currentRect.bottom.toFixed(0)}`
                );
            }

            if (!isValid) return;

            // Check for Overlapping Elements (Visual Obstruction)
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const topEl = document.elementFromPoint(centerX, centerY);

            if (topEl && !cand.contains(topEl) && !topEl.contains(cand)) {
                // FIX: Allow Label <-> Input obstruction
                // If the candidate is a label and it's obscured by its target input (or vice versa), that's fine.
                // This happens with custom checkboxes/radios where the input is on top of the label.
                let isRelatedControl = false;
                if (cand.tagName === 'LABEL' && cand.getAttribute('for') === topEl.id) {
                    isRelatedControl = true;
                } else if (topEl.tagName === 'LABEL' && topEl.getAttribute('for') === cand.id) {
                    isRelatedControl = true;
                }

                if (isRelatedControl) {
                    // Valid obstruction by related control -> Allow
                } else {
                    // BUG FIX: Allow navigation to elements obscured by fixed/sticky containers (headers/footers)
                    // We must traverse up the tree because elementFromPoint might return a child of the fixed element.
                    let isObstructingFixed = false;
                    let obstacle = topEl;
                    while (obstacle && obstacle !== document.body) {
                        const style = window.getComputedStyle(obstacle);
                        if (style.position === 'fixed' || style.position === 'sticky') {
                            isObstructingFixed = true;
                            break;
                        }
                        obstacle = obstacle.parentElement;
                    }

                    if (!isObstructingFixed) {
                        // Obscured by something unrelated (not a fixed/sticky header)
                        return;
                    }
                }
            }

            const targetIsSticky = this.isSticky(cand);
            let score;

            if (mode === 'extreme') {
                // Home/End: stay on the line and take the furthest one. The cone
                // above already guaranteed the direction, so all that is left is
                // membership of the line and reach along it.
                if (!window.TuiLineRules) return;

                const axis = window.TuiLineRules.axisOf(key);
                if (!window.TuiLineRules.sameLine(currentRect, rect, axis)) return;

                // Negated, so the furthest element wins the lowest-score contest
                // this loop already runs.
                score = -window.TuiLineRules.reach(rect, key);

                // No sticky penalty here on purpose. "The last one on this row"
                // should mean exactly that; a hidden weighting would make the
                // key land somewhere the user cannot predict from the layout.
            } else {
                // Step C: The Distance/Priority Formula
                score = this.getDistance(currentRect, rect, key);

                // Penalize FIXED/STICKY elements to prevent them from hijacking navigation
                // when they visually overlap or are geometrically closer than the scrolling content.
                // BUG FIX: Only apply penalty if we are moving FROM non-sticky TO sticky.
                // If we are already in a sticky container (like Header), we should be able to move to other sticky containers (Sidebar) freely.
                if (targetIsSticky && !currentIsSticky) {
                    score += 500;
                }
            }

            if (this.debugMode) {
                // Store for debug logging
                cand._debugScore = score;
                cand._debugDistance = score; // Since score IS distance currently
                cand._debugIsSticky = targetIsSticky;
            }

            if (score < minScore) {
                minScore = score;
                bestCandidate = cand;
            }
        });

        if (this.debugMode) {
            const ranked = this.candidates
                .filter(c => c._debugScore !== undefined)
                .sort((a, b) => a._debugScore - b._debugScore)
                .slice(0, 5)
                .map(c => {
                    let name = c.tagName;
                    if (c.id) name += '#' + c.id;
                    else if (c.className) name += '.' + c.className.split(' ').join('.');
                    return `🏆 ${name} [Score: ${c._debugScore.toFixed(2)}]`;
                });

            console.log('[TUI] Candidates Analysis (Top 5)');
            ranked.forEach((r, i) => console.log(i === 0 ? r : `${i + 1}. ${r.replace('🏆 ', '')}`));

            // Cleanup
            this.candidates.forEach(c => delete c._debugScore);
        }

        return bestCandidate;
    }

    getDistance(currentRect, targetRect, direction) {
        // Distance along the direction plus a penalty for leaving the current
        // line. See stepScore in line-rules.js, which is tested against exact
        // coordinates.
        if (!window.TuiLineRules) return Infinity;
        return window.TuiLineRules.stepScore(currentRect, targetRect, direction);
    }

    isTrapElement(el) {
        // Elements that swallow focus and prevent bubbling
        return ['IFRAME', 'FRAME', 'OBJECT', 'EMBED'].includes(el.tagName);
    }

    /**
     * Detects if an element is a member of a roving tabindex group.
     * Roving tabindex is a pattern where a composite widget (toolbar, navbar, etc.)
     * owns the tab stop (tabindex="0" on the container) while child items have
     * tabindex="-1" and are navigated via arrow keys.
     * This allows TUI to include those children as spatial navigation candidates.
     */
    isRovingTabindexMember(el) {
        // Walk up ancestors (limit depth to avoid perf issues)
        let ancestor = el.parentElement;
        let depth = 0;
        while (ancestor && ancestor !== document.body && depth < 6) {
            const ati = ancestor.getAttribute('tabindex');
            if (ati === '0') {
                // Container owns the tab stop; children use roving tabindex
                return true;
            }
            const role = ancestor.getAttribute('role');
            const tag = ancestor.tagName;
            // Composite widget roles and semantic elements that imply roving tabindex
            if (['toolbar', 'tablist', 'menubar', 'menu', 'listbox', 'tree', 'grid', 'radiogroup'].includes(role) ||
                ['NAV', 'HEADER'].includes(tag)) {
                return true;
            }
            ancestor = ancestor.parentElement;
            depth++;
        }

        // Sibling heuristic: if siblings share the same tag and also have tabindex,
        // they are likely part of a roving group (e.g. multiple buttons in a navbar).
        const parent = el.parentElement;
        if (parent) {
            const siblings = Array.from(parent.children);
            const sameTagSiblings = siblings.filter(s => s !== el && s.tagName === el.tagName);
            const hasRovingSiblings = sameTagSiblings.some(s =>
                s.getAttribute('tabindex') === '-1' || s.getAttribute('tabindex') === '0'
            );
            if (hasRovingSiblings) return true;
        }

        return false;
    }

    focusElement(el, attempt = 1) {
        // DEBUG: Log what element we're trying to focus
        if (this.debugMode) {
            const tag = el.tagName;
            const id = el.id ? `#${el.id}` : '';
            const cls = el.className ? `.${el.className.split(' ').join('.')}` : '';
            const isContentEditable = el.isContentEditable ? ' [contenteditable]' : '';

            console.group(`[TUI] focusElement (Attempt ${attempt})`);
            console.log(`Target: ${tag}${id}${cls}${isContentEditable}`);

            // Log relevant attributes for diagnosis
            const attrs = ['tabindex', 'role', 'aria-hidden', 'aria-disabled', 'disabled', 'type'];
            const attrLog = attrs.reduce((acc, attr) => {
                if (el.hasAttribute(attr)) acc[attr] = el.getAttribute(attr);
                return acc;
            }, {});
            console.log('Attributes:', attrLog);

            // Log Label diagnostics
            if (tag === 'LABEL') {
                const forId = el.getAttribute('for');
                if (forId) {
                    const target = document.getElementById(forId);
                    if (target) {
                        const style = window.getComputedStyle(target);
                        console.log('Label Target:', {
                            tagName: target.tagName,
                            id: target.id,
                            type: target.getAttribute('type'),
                            display: style.display,
                            visibility: style.visibility,
                            disabled: target.disabled,
                            tabindex: target.getAttribute('tabindex'),
                            ariaHidden: target.getAttribute('aria-hidden')
                        });
                    } else {
                        console.warn('Label Target: NOT FOUND (ID: ' + forId + ')');
                    }
                } else {
                    console.log('Label: No "for" attribute');
                }
            }

            // Log computed style focus blockers
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') console.warn('⚠️ Element is hidden!');
            if (style.pointerEvents === 'none') console.warn('⚠️ pointer-events: none');

            console.log('OuterHTML (truncated):', el.outerHTML.substring(0, 150) + '...');
        }

        const cleanupLogs = () => {
            if (this.debugMode) console.groupEnd();
        };

        // 1. Handle Virtual Focus for Trap Elements
        if (this.isTrapElement(el)) {
            // We DO NOT call el.focus() because that surrenders control to the iframe.
            // Instead, we just highlight it and keep system focus on the body (or blur current).
            document.activeElement.blur();
            el.scrollIntoView({ behavior: this.scrollBehavior(), block: 'nearest' });
            this.highlight(el);
            cleanupLogs();
            return true; // Success (Virtual)
        }

        // 2. Handle Inputs (Wrapper Focus)
        // Improvement: Only wrap inputs that need arrow keys (Text, Select).
        // Buttons, checkboxes, etc. can be focused directly.
        if (this.shouldTrapArrows(el)) {
            if (this.debugMode) console.log('[TUI] Element needs wrapper (shouldTrapArrows=true)');

            const parent = el.parentElement;
            if (parent) {
                if (this.debugMode) {
                    const parentTag = parent.tagName;
                    const parentId = parent.id ? `#${parent.id}` : '';
                    console.log(`[TUI] Focusing parent wrapper: ${parentTag}${parentId}`);
                }

                // Make parent focusable if not already
                if (!parent.hasAttribute('tabindex')) {
                    parent.setAttribute('tabindex', '-1');
                }

                // Link them so Enter key knows where to go
                parent._tui_input = el;

                parent.focus();

                if (this.debugMode) {
                    console.log('[TUI] After parent.focus(), activeElement:', document.activeElement.tagName, document.activeElement.id || '(no id)');
                    console.log('[TUI] Is contenteditable active?', document.activeElement === el);
                }

                // CRITICAL FIX: Verify wrapper focus success
                // If focus didn't move to parent (or inside it), it means parent refused focus.
                if (document.activeElement !== parent && !parent.contains(document.activeElement)) {
                    if (this.debugMode) console.log('[TUI] ⚠️ Wrapper focus FAILED. Parent is not focusable. Marking candidate as failed.');
                    this.failedFocusElements.add(el);
                    cleanupLogs();
                    return false; // Failed
                }

                // CRITICAL FIX: Ensure contenteditable elements don't auto-activate
                // Some browsers/sites may still try to focus the contenteditable
                // when its parent wrapper is focused. Explicitly blur it.
                if (el.isContentEditable && document.activeElement === el) {
                    if (this.debugMode) console.log('[TUI] ⚠️ Contenteditable got focus! Blurring it...');
                    el.blur();
                    if (this.debugMode) console.log('[TUI] After blur(), activeElement:', document.activeElement.tagName);
                }

                parent.scrollIntoView({ behavior: this.scrollBehavior(), block: 'nearest' });
                this.highlight(parent);
                cleanupLogs();
                return true; // Success
            } else {
                if (this.debugMode) console.log('[TUI] ⚠️ No parent found for wrapping!');
                // Fallthrough to normal focus if no parent
            }
        }

        // 3. Normal Focus
        // An item whose container owns focus has no tabindex, and focus() on it
        // would do nothing. Give it one, the way the widget itself would.
        if (el._tui_owned_item && !el.hasAttribute('tabindex')) {
            el.setAttribute('tabindex', '-1');
        }
        if (this.debugMode) console.log('[TUI] Using normal focus (no wrapper needed)');
        el.focus();
        if (this.debugMode) console.log('[TUI] After el.focus(), activeElement:', document.activeElement.tagName, document.activeElement.id || '(no id)');

        // CRITICAL FIX: Check if focusing this element caused a DIFFERENT element to get focus
        // This can happen with:
        // - LABELs that redirect focus to their associated INPUT (checkbox, radio)
        // - Contenteditable elements (YouTube comments, etc.)
        // - Parent wrappers that intercept focus (GitHub autocomplete, etc.)
        // - Autocomplete widgets
        // - Custom focus management in web apps
        const actualFocus = document.activeElement;

        // Simple check: did focus move at all?
        // Note: actualFocus could be body if focus failed completely

        if (actualFocus !== el) {
            if (this.debugMode) console.log('[TUI] ⚠️ Focus went to different element! Intended:', el.tagName, 'Actual:', actualFocus.tagName);

            // SPECIAL CASE: Focus returned to the element we started from
            if (actualFocus === this.lastActiveElement) {
                if (this.debugMode) {
                    console.log('[TUI] ⚠️ Focus attempt REJECTED! Focus returned to previous element.');
                    console.log('[TUI] Adding to exclusion list. Next navigation will try different candidate.');
                }
                this.failedFocusElements.add(el);
                cleanupLogs();
                return false; // Failed
            }

            // SPECIAL CASE: LABEL → INPUT focus redirect
            const isLabelRedirect = (el.tagName === 'LABEL' &&
                (actualFocus.tagName === 'INPUT' || actualFocus.tagName === 'TEXTAREA' || actualFocus.tagName === 'SELECT'));

            if (isLabelRedirect) {
                // Track the INPUT as lastActiveElement so we can navigate back to it
                this.lastActiveElement = actualFocus;

                // Highlight the INPUT (the actual focused element)
                actualFocus.scrollIntoView({ behavior: this.scrollBehavior(), block: 'nearest' });
                this.highlight(actualFocus);

                cleanupLogs();
                return true;
            }

            // SPECIAL CASE: focus bounced up to an ancestor.
            // Lists do this: the row owns the tabindex and the link inside it is
            // tab-unreachable, so focusing the link focuses the row. The row has
            // no click handler, so Enter on it would do nothing - remember what
            // we were actually aiming at so Enter can click that instead.
            if (actualFocus.contains && actualFocus.contains(el)) {
                if (this.debugMode) console.log('[TUI] Focus bounced to ancestor; Enter will activate', el.tagName, el.id || '(no id)');
                actualFocus._tui_activate = el;
            } else {
                actualFocus._tui_activate = null;
            }

            // Trust the browser focus (it moved somewhere valid)
            this.lastActiveElement = actualFocus;
            this.highlight(actualFocus);

            cleanupLogs();
            return true;
        }

        // Focus succeeded as expected (actualFocus === el)
        // Drop any stale aim from an earlier bounce: this element is the target now.
        el._tui_activate = null;
        this.lastActiveElement = el;
        el.scrollIntoView({ behavior: this.scrollBehavior(), block: 'nearest' });
        this.highlight(el);

        cleanupLogs();
        return true;
    }

    handleOffScreen(key) {
        const scrollAmount = 300;
        if (key === 'ArrowDown') window.scrollBy({ top: scrollAmount, behavior: this.scrollBehavior() });
        if (key === 'ArrowUp') window.scrollBy({ top: -scrollAmount, behavior: this.scrollBehavior() });
        // NOTE: A re-scan happens on the NEXT keypress because scroll creates a new geometric state.
    }



    _startLogCapture() {
        if (this._originalConsoleLog) return; // Already capturing
        this._originalConsoleLog = console.log;
        this._originalConsoleGroup = console.group;
        this._originalConsoleGroupEnd = console.groupEnd;

        let tuiGroupDepth = 0;
        const self = this;

        const format = (...args) => args.map(a => {
            if (typeof a === 'object') {
                try { return JSON.stringify(a); } catch (e) { return String(a); }
            }
            return String(a).replace(/%c/g, '');
        }).join(' ');

        const isTui = msg => msg.includes('[TUI]') || msg.includes('[TUI Spatial]');

        console.group = function (...args) {
            self._originalConsoleGroup.apply(console, args);
            const msg = format(...args);
            if (isTui(msg)) {
                tuiGroupDepth++;
                self.logBuffer.push(`[${new Date().toISOString()}] ${msg}`);
            } else if (tuiGroupDepth > 0) {
                tuiGroupDepth++;
                self.logBuffer.push(`[${new Date().toISOString()}] ${'  '.repeat(tuiGroupDepth)}${msg}`);
            }
        };

        console.groupEnd = function () {
            self._originalConsoleGroupEnd.apply(console);
            if (tuiGroupDepth > 0) tuiGroupDepth--;
        };

        console.log = function (...args) {
            self._originalConsoleLog.apply(console, args);
            const msg = format(...args);
            if (isTui(msg) || tuiGroupDepth > 0) {
                const indent = '  '.repeat(tuiGroupDepth);
                self.logBuffer.push(`[${new Date().toISOString()}] ${indent}${msg}`);
            }
        };
    }

    _stopLogCapture() {
        if (this._originalConsoleLog) {
            console.log = this._originalConsoleLog;
            this._originalConsoleLog = null;
        }
        if (this._originalConsoleGroup) {
            console.group = this._originalConsoleGroup;
            this._originalConsoleGroup = null;
        }
        if (this._originalConsoleGroupEnd) {
            console.groupEnd = this._originalConsoleGroupEnd;
            this._originalConsoleGroupEnd = null;
        }
    }

    broadcastStatus() {
        this.safeSendMessage({
            type: 'STATUS_UPDATE',
            payload: { supported: true, enabled: this.isEnabled }
        });
    }

    /**
     * Safely sends a message to the runtime, handling context invalidation errors.
     * This prevents errors when the extension is updated/reloaded but the page isn't.
     */
    safeSendMessage(message) {
        if (!chrome.runtime || !chrome.runtime.id) {
            // Context is already invalidated, do nothing.
            return;
        }

        try {
            chrome.runtime.sendMessage(message).catch(() => {
                // Catch promise rejections (receiver closed, etc)
            });
        } catch (e) {
            // Catch synchronous errors (context invalidated)
        }
    }


    /*
     * MENU SYSTEM
     */
    async injectMenu() {
        if (document.getElementById('tui-menu-container')) return;

        try {
            const response = await fetch(chrome.runtime.getURL('menu.html'));
            const html = await response.text();

            // Create a wrapper to hold the HTML string
            const wrapper = document.createElement('div');
            wrapper.innerHTML = html;

            this.menuContainer = wrapper.firstElementChild;
            document.body.appendChild(this.menuContainer);

            // Cache menu items
            this.menuItems = Array.from(this.menuContainer.querySelectorAll('.tui-menu-item'));

            // Add click listeners for mouse support
            this.menuItems.forEach((item, index) => {
                item.addEventListener('click', () => {
                    this.executeMenuAction(item.dataset.action);
                });
                item.addEventListener('mouseenter', () => {
                    this.selectedMenuIndex = index;
                    this.updateMenuSelection();
                });
            });

        } catch (e) {
            console.error('[TUI] Failed to load menu:', e);
        }
    }

    toggleMenu() {
        if (this.isMenuOpen) {
            this.closeMenu();
        } else {
            this.openMenu();
        }
    }

    openMenu() {
        if (!this.menuContainer) return;
        this.isMenuOpen = true;
        this.menuContainer.classList.add('tui-menu-visible');
        this.selectedMenuIndex = 0; // Select first item by default
        this.updateMenuSelection();
        this.isActiveMode = false; // Disable navigation ring while in menu
        if (this.spotlight) this.spotlight.style.display = 'none';
    }

    closeMenu() {
        if (!this.menuContainer) return;
        this.isMenuOpen = false;
        this.menuContainer.classList.remove('tui-menu-visible');
    }

    handleMenuNavigation(e) {
        e.preventDefault();
        e.stopPropagation();

        if (e.key === 'Escape') {
            this.closeMenu();
            return;
        }

        if (e.key === 'ArrowDown') {
            this.selectedMenuIndex = (this.selectedMenuIndex + 1) % this.menuItems.length;
            this.updateMenuSelection();
        } else if (e.key === 'ArrowUp') {
            this.selectedMenuIndex = (this.selectedMenuIndex - 1 + this.menuItems.length) % this.menuItems.length;
            this.updateMenuSelection();
        } else if (e.key === 'Enter') {
            const selectedItem = this.menuItems[this.selectedMenuIndex];
            if (selectedItem) {
                this.executeMenuAction(selectedItem.dataset.action);
            }
        }
    }

    updateMenuSelection() {
        this.menuItems.forEach((item, index) => {
            if (index === this.selectedMenuIndex) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }

    executeMenuAction(action) {
        console.log('[TUI] Executing menu action:', action);
        this.closeMenu();

        if (action === 'duplicate') {
            window.open(window.location.href, '_blank');
        } else if (action === 'back') {
            window.history.back();
        }
    }
}

// Start
new SpatialEngine();
