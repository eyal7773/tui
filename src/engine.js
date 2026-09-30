/**
 * TUI Spatial Navigation Engine
 * A pure geometric navigation engine that doesn't rely on site-specific configs.
 */

// What the engine did, for a bug report (see tui-log.js). If it failed to
// load, logging is skipped rather than every call site checking.
const LOG = window.TuiLog || {
    event() {}, detail() {}, error() {}, describe: () => '', verbose: false
};

class SpatialEngine {
    constructor(options = {}) {
        // Running inside an iframe (see the start of the engine at the bottom
        // of this file). The badge, the session count and the log belong to
        // the top page, so a frame stays quiet about them.
        this.isSubframe = !!options.subframe;
        this.candidates = [];
        this.candidatesDirty = true;
        this.isEnabled = true;

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
        this.steppedTo = null; // Where the last arrow step landed, as opposed to focus the page placed
        this.leavingBar = null; // The bottom bar a step down is leaving (see belowBottomBar)
        this.leftBar = null; // The bottom bar the ring stepped down out of, passed by after

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
        // A key whose press the engine took has its release taken too. The
        // page never saw the keydown, so it must not act on the keyup either:
        // Wikipedia toggles its menu checkbox on Enter's keyup, which undid the
        // click Enter had just made, and the menu never opened.
        this.swallowedKeys = new Set();
        document.addEventListener('keydown', (e) => {
            const wasPrevented = e.defaultPrevented;
            this.handleKeydown(e);
            if (!wasPrevented && e.defaultPrevented) this.swallowedKeys.add(e.key);
        }, { capture: true });
        document.addEventListener('keyup', (e) => {
            if (!this.swallowedKeys.delete(e.key)) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            this.handleInteraction(e);
        }, { capture: true });
        // NOTE: We keep scroll passive and bubbling as scroll doesn't usually get trapped like keys
        // Captured on the document rather than heard on the window: scroll does
        // not bubble, so a carousel scrolling its own box (BBC's "Recommended
        // audio") never reached a window listener and the ring was left where
        // the card had been until something else moved it.
        document.addEventListener('scroll', () => this.handleScroll(), { passive: true, capture: true });

        // A frame the ring stepped into hands the keyboard back (leaveFrame).
        window.addEventListener('message', (e) => this.handleFrameExit(e));

        // Passive interaction listeners to sync state without interference
        document.addEventListener('mousedown', (e) => this.handleInteraction(e), { passive: true });
        document.addEventListener('click', (e) => this.handleInteraction(e), { passive: true });
        document.addEventListener('keyup', (e) => this.handleInteraction(e), { passive: true });

        // Handle window resize to update spotlight position if needed
        window.addEventListener('resize', () => {
            if (this.textMode) this.updateCaret();
            else if (this.lastActiveElement) this.highlight(this.lastActiveElement);
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
            // scrollToReveal's scroll-margin on the target is ours as well.
            const ours = (r) => r.target === this.spotlight ||
                (r.target === this.lastActiveElement && r.attributeName === 'style');
            if (records.some(r => !ours(r))) this.scheduleRingUpdate(true);
        });
        this.observerOptions = {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class', 'hidden', 'disabled']
        };
        this.observer.observe(document.body, this.observerOptions);

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
        });

        // Broadcast initial status (always supported now)
        this.broadcastStatus();

        // Inject Menu
        this.injectMenu();
    }

    createSpotlight() {
        // Check if exists
        let spot = document.getElementById('tui-spotlight');
        if (!spot) {
            spot = document.createElement('div');
            spot.id = 'tui-spotlight';
            spot.className = 'tui-focus-indicator';
            // Hidden until it has somewhere to be. Shown at once it had no
            // size yet, and its outline sat as a green square wherever the
            // body put it: MDN's top-left corner before any key was pressed.
            spot.style.display = 'none';
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

        // In text mode the caret stands in for the ring.
        if (this.textMode) {
            if (this.spotlight) this.spotlight.style.display = 'none';
            this.updateCaret();
            return;
        }

        // FEATURE: Lazy Focus
        // If the user hasn't started using arrow keys yet (isActiveMode is false),
        // we track the element internally but DO NOT show the intrusive green UI.
        // This solves the issue on Google/WhatsApp where autofocus on load creates a Visual Bug.
        if (!this.isActiveMode) {
            if (this.spotlight) this.spotlight.style.display = 'none';
            return;
        }

        // Calculate position
        const rect = this.rectOf(el);
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;

        // The element was hidden under the ring. Amazon's "Carousel next
        // slide" goes display:none once Enter reaches the last slide, and the
        // ring shrank to a dot in the corner. Hide it; the next arrow starts
        // from where the element was last seen (see navigate).
        if (rect.width === 0 && rect.height === 0) {
            if (this.spotlight) this.spotlight.style.display = 'none';
            return;
        }
        this.lastRingPlace = { el, left: rect.left + scrollX, top: rect.top + scrollY, width: rect.width, height: rect.height };

        // The page may have thrown the ring away. weather.com's React render
        // replaces what is in <body> after load, and the ring was never seen
        // again: focus moved, nothing showed.
        if (this.spotlight && !this.spotlight.isConnected && document.body) {
            document.body.appendChild(this.spotlight);
        }

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
        return !this.shouldTrapArrows(this.deepActiveElement());
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
            const active = this.deepActiveElement();
            if (active && active !== document.body && typeof active.blur === 'function') {
                active.blur();
            }
            this.lastActiveElement = null;
        }

        // Logged by applyEnabledState, as handedOver.
        this.applyEnabledState();
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
            this.exitTextMode(false);
        }

        console.log(`[TUI] ${this.isEnabled ? 'Enabled' : 'Disabled'}` +
            (this.isExcluded ? ' (site is on the excluded list)' : ''));
        LOG.event('enabled', { on: this.isEnabled, excluded: this.isExcluded, handedOver: this.isSuspended });

        // Deliberately not broadcastStatus(): background counts every
        // STATUS_UPDATE as a page load, and a settings flip is not one.
        if (this.isSubframe) return;
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
    }

    handleScroll() {
        // Candidates are chosen by how near the screen they are, so a scroll
        // changes them even when the page does not. Only a DOM change used to
        // mark them stale, and on a quiet page (NASA) ArrowDown scrolled on
        // and on past links that had come into reach. The scan itself waits
        // for the next key.
        this.candidatesDirty = true;
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

        const rect = this.rectOf(el);
        const covered = this.coveredEdges(el);
        const outOfView = rect.bottom > window.innerHeight - covered.bottom || rect.top < covered.top;
        // Taller than the room left: it cannot fit, and 'nearest' would jitter.
        if (!outOfView || rect.height > window.innerHeight - covered.top - covered.bottom) return;
        this.scrollToReveal(el);
    }

    /**
     * Scrolls el into the part of the window that fixed bars leave free. A
     * plain scrollIntoView counts a sticky banner as visible space, so the
     * target could land behind it. The room is reserved with scroll-margin,
     * which the browser reads when the scroll starts, so it is set only for
     * the call.
     */
    scrollToReveal(el) {
        const covered = this.coveredEdges(el);
        const style = el.style;
        const saved = [style.scrollMarginTop, style.scrollMarginBottom];
        if (covered.top) style.scrollMarginTop = `${covered.top}px`;
        if (covered.bottom) style.scrollMarginBottom = `${covered.bottom}px`;

        el.scrollIntoView({ behavior: this.scrollBehavior(), block: 'nearest' });

        if (covered.top || covered.bottom) {
            style.scrollMarginTop = saved[0];
            style.scrollMarginBottom = saved[1];
        }
    }

    /**
     * Pixels of the top and bottom edges that fixed or sticky bars cover in
     * el's column, read from whatever is topmost there (see coveredEdges in
     * view-rules.js). A bar that holds el is where el lives, not a cover.
     */
    coveredEdges(el) {
        const none = { top: 0, bottom: 0 };
        if (!window.TuiViewRules || typeof document.elementFromPoint !== 'function') return none;

        const rect = el.getBoundingClientRect();
        const x = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
        const bars = [];
        for (const y of [1, window.innerHeight - 2]) {
            const bar = this.pinnedAncestor(this.deepElementFromPoint(x, y));
            if (bar && bar !== this.spotlight && !this.composedContains(bar, el)) bars.push(bar.getBoundingClientRect());
        }
        return window.TuiViewRules.coveredEdges(window.innerHeight, bars);
    }

    /**
     * Is el inside a bar pinned along the top or bottom edge, such as a cookie
     * strip, rather than in the page or in a dialog?
     *
     * ESPN's cookie banner focuses its "Cookie Policy" link on load, at the
     * bottom of the window. The first ArrowDown started from there, so it went
     * "below" it: halfway down the page to "Create Account", scrolling 483px.
     * On the first press such a focus is not taken as the starting point and
     * the ring starts at the top instead. A modal dialog does keep its focus:
     * there the page means it. role="dialog" alone is not enough to tell,
     * since OneTrust puts it on that same non-modal strip.
     */
    isInEdgeBar(el) {
        const bar = this.pinnedAncestor(el);
        if (!bar || !window.TuiViewRules) return false;
        try {
            if (this.composedClosest(el, 'dialog:modal, [aria-modal="true"]')) return false;
        } catch (e) {
            // :modal unsupported; the aria-modal half is checked on its own.
            if (this.composedClosest(el, '[aria-modal="true"]')) return false;
        }

        // A floating card counts too. Stack Overflow's OneTrust box sits 16px
        // above the bottom edge, and the first ArrowDown from its focus went
        // 1000px down the question to a code block's Copy button.
        const FLOATING_SLACK = 40;
        const covered = window.TuiViewRules.coveredEdges(window.innerHeight, [bar.getBoundingClientRect()], FLOATING_SLACK);
        return covered.top > 0 || covered.bottom > 0;
    }

    /**
     * A fixed box over the whole window, such as the dimmed backdrop behind
     * a consent dialog, or null. Reuters dims the page behind its OneTrust
     * banner, and ArrowDown from the banner went on to stories below the
     * fold: they were not on screen to be found covered, and scrolling them
     * in put them under the backdrop, where a click cannot reach them.
     *
     * It looks down through what is stacked at the middle of the window: AP
     * News puts its consent dialog there, in a box of its own above the
     * backdrop. The first thing that is part of the page itself ends the
     * search, so a fixed background under the content is no cover.
     */
    windowCover() {
        const stack = document.elementsFromPoint(window.innerWidth / 2, window.innerHeight / 2);
        for (const hit of stack) {
            if (hit === document.body || hit === document.documentElement) return null;
            let fixed = null;
            for (let node = hit; node && node !== document.body && node !== document.documentElement; node = this.composedParent(node)) {
                if (window.getComputedStyle(node).position === 'fixed') { fixed = node; break; }
            }
            if (!fixed) return null;   // the page itself is on top here
            const style = window.getComputedStyle(fixed);
            const box = fixed.getBoundingClientRect();
            const whole = box.width >= window.innerWidth * 0.9 && box.height >= window.innerHeight * 0.9;
            if (whole && parseFloat(style.opacity) >= 0.05 && style.pointerEvents !== 'none') return fixed;
        }
        return null;
    }

    /**
     * Is el somewhere the user cannot see? Forbes focuses a link parked off
     * the right edge of the window as it loads, and the first ArrowDown
     * started from there, landing on its moving headline ticker instead of
     * the top of the page. Like a cookie strip's focus (isInEdgeBar), the
     * first press does not start from it.
     */
    isOutOfSight(el) {
        const rect = this.rectOf(el);
        return !!window.TuiViewRules && !!rect && (rect.width > 0 || rect.height > 0) &&
            !window.TuiViewRules.onScreen(rect);
    }

    /** The nearest ancestor-or-self that is position fixed or sticky, or null. */
    pinnedAncestor(node) {
        for (; node && node !== document.body && node !== document.documentElement; node = this.composedParent(node)) {
            const position = window.getComputedStyle(node).position;
            if (position === 'fixed' || position === 'sticky') return node;
        }
        return null;
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
                // The caret stands in for the ring, and there may be no ring
                // at all (text mode started from the menu). Nor is the page
                // pulled back to the ring's element under the caret.
                if (this.textMode) {
                    this.updateCaret();
                    return;
                }
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
        // Text mode takes the keys it has a use for, Escape among them: there
        // it leaves the mode rather than handing the keyboard over.
        if (this.textMode) {
            this.handleTextKey(e);
            return;
        }

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

        // A key after Enter means the user has moved on: the hint that Enter
        // twice is a double-click is no longer wanted, nor the wait for it.
        this.endClickWatch();
        this.hideHint();

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
        const active = this.deepActiveElement();

        // BUG FIX: Only trap navigation if the input actually USES arrow keys (Text, Select, etc.)
        // Simple buttons (submit, reset, button) should NOT trap navigation.
        // Nor does a text box out of sight: Merriam-Webster autofocuses a
        // search box parked above the window, and the first ArrowDown went
        // to a box the user could not see.
        if (this.shouldTrapArrows(active) && !this.isOutOfSight(active)) {
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

        // Shift+arrow selects, as it does in any editor: it starts text mode
        // from the text under the ring. Inside a text box it never gets here.
        if (window.TuiTextRules && window.TuiTextRules.startsTextMode(e)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            this.enterTextMode(e);
            return;
        }

        if (e.key && e.key.startsWith('Arrow')) {
            // We handle this navigation action
            e.preventDefault();
            e.stopImmediatePropagation(); // CRITICAL: Stop the page from seeing this key
            this.navigate(e.key);
        } else if (e.key === 'Enter') {
            const active = this.deepActiveElement();

            // Enter steps into a frame. The ring only marks an iframe and
            // keeps the keys up here (see focusElement), so without this
            // there was no way in: on NYTimes a full-page bot check in a
            // captcha-delivery frame was ringed, and Enter clicked <body>.
            // Focused, the frame gets the keys and its own engine takes the
            // next arrow.
            const frame = this.lastActiveElement;
            if (frame && frame.isConnected && this.isTrapElement(frame) && active !== frame) {
                e.preventDefault();
                e.stopImmediatePropagation();
                LOG.event('frame-enter', { frame: LOG.describe(frame) });
                frame.focus();
                // The frame draws its own ring; this one waits for the way back.
                this.isActiveMode = false;
                if (this.spotlight) this.spotlight.style.display = 'none';
                return;
            }

            // Check if we are on a wrapper that has a stashed input
            // CRITICAL: Also check lastActiveElement in case focus is on body (contenteditable fix)
            const wrapper = (active && active._tui_input) ? active :
                (this.lastActiveElement && this.lastActiveElement._tui_input) ? this.lastActiveElement :
                    null;

            if (wrapper && wrapper._tui_input) {
                e.preventDefault();
                e.stopImmediatePropagation();

                const input = wrapper._tui_input;
                LOG.event('enter-input', { input: LOG.describe(input) });
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
                // Enter twice on the same element is a double-click, which is
                // how a file opens in Drive; one click only selects it. The
                // first press has already clicked, so the second completes
                // the pair, as a mouse would, and nothing waits on a timer.
                const rules = window.TuiClickRules;
                const last = this.lastEnter;
                const now = Date.now();
                const second = !!rules && !e.repeat && !!last && last.el === active &&
                    now - last.at <= rules.DOUBLE_ENTER_MS;
                this.lastEnter = second ? null : { el: active, at: now };
                LOG.event('enter', { on: LOG.describe(active), second: second, afterMs: last ? now - last.at : undefined });
                if (second) {
                    this.simulateClick(active, 2);
                } else {
                    // Watching from before the click: the page's handler runs
                    // inside it, and a dialog it opens is already there after.
                    this.watchClickEffect(active);
                    this.simulateClick(active);
                }
                this.safeSendMessage({ type: 'METRIC_EVENT', payload: { action: 'ENTER', key: 'Enter' } });
            }
        }
    }

    simulateClick(el, clickCount = 1) {
        // SMART TARGETING: the focused element is often not the element that
        // does the work. A list row keeps the tabindex while the link inside it
        // carries the href, and clicking the row does nothing at all.
        // click-rules.js decides; _tui_activate is the element navigation was
        // aiming at when the browser bounced focus up to this container.
        let target = el;
        const intended = (el._tui_activate && el._tui_activate.isConnected)
            ? el._tui_activate : null;

        if (window.TuiClickRules) {
            target = window.TuiClickRules.resolveClickTarget(el, intended) || el;
        }

        const options = {
            view: window,
            bubbles: true,
            cancelable: true,
            composed: true,  // Allow events to cross shadow DOM boundaries
            buttons: 1,
            detail: clickCount,
            pointerType: 'mouse'  // Explicitly mark as mouse event (not pen/touch)
        };

        // 1. Dispatch generic Down/Up events first (required for some UI frameworks)
        // Standard sequence: pointerdown -> mousedown -> pointerup -> mouseup -> click
        target.dispatchEvent(new PointerEvent('pointerdown', options));
        target.dispatchEvent(new MouseEvent('mousedown', options));
        target.dispatchEvent(new PointerEvent('pointerup', options));
        target.dispatchEvent(new MouseEvent('mouseup', options));

        // A mouse puts the second click of a pair, and the dblclick after it,
        // at the middle of the element.
        const r = clickCount === 2 ? target.getBoundingClientRect() : null;
        const pair = r ? { ...options, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 } : null;

        // 2. Perform the Click
        // Use native click() if available as it effectively triggers the 'click' event
        // AND handles default behaviors (like navigation for <a> tags).
        // Not for the second click of a pair: native click() always has
        // detail 0, and Drive opens a file only when that click says 2.
        const native = !pair && typeof target.click === 'function';
        LOG.event('click', {
            on: LOG.describe(target),
            from: target !== el ? LOG.describe(el) : undefined,
            why: target === el ? undefined : (intended === target ? 'aimed-at' : 'container-action'),
            count: clickCount,
            dblclick: !!pair,
            via: native ? 'click()' : 'dispatchEvent'
        });
        if (pair) {
            target.dispatchEvent(new MouseEvent('click', pair));
        } else if (native) {
            target.click();
        } else {
            // Fallback for elements without .click() (e.g., SVG in some contexts)
            target.dispatchEvent(new MouseEvent('click', options));
        }

        // 3. The second click of a pair is followed by dblclick.
        if (pair) target.dispatchEvent(new MouseEvent('dblclick', pair));
    }

    /**
     * After Enter clicked el, waits CLICK_EFFECT_MS for a sign that the click
     * did something: the page navigated or was left, focus moved, el went
     * away, a dialog or menu came up, or something opened, expanded or
     * toggled. With none, the hint says that Enter twice is a double-click.
     * Only for elements that may want one (see mayWantDoubleClick); a row
     * that only got selected counts as nothing.
     */
    watchClickEffect(el) {
        const rules = window.TuiClickRules;
        if (!rules || !rules.mayWantDoubleClick(el) || !document.body) return;
        this.endClickWatch();

        const href = location.href;
        const ours = (node) => node === this.spotlight || node === this.hint ||
            node.id === 'tui-menu-container';
        const overlayInside = (node) => rules.isOverlay(node) || (!!node.querySelector && !!node.querySelector(
            'dialog, [popover], [aria-modal="true"], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'));
        const observer = new MutationObserver((records) => {
            const acted = records.some(r => r.type === 'attributes'
                ? !ours(r.target)
                : Array.from(r.addedNodes).some(n => n.nodeType === 1 && !ours(n) && overlayInside(n)));
            if (acted) this.endClickWatch();
        });
        observer.observe(document.body, {
            subtree: true, childList: true, attributes: true, attributeFilter: rules.EFFECT_ATTRIBUTES
        });

        // Leaving the page, or a new tab taking the window, ends it too.
        const left = () => this.endClickWatch();
        const nav = window.navigation;
        window.addEventListener('pagehide', left);
        window.addEventListener('blur', left);
        if (nav) nav.addEventListener('navigate', left);

        const timer = setTimeout(() => {
            const moved = location.href !== href || document.hidden || !el.isConnected ||
                this.deepActiveElement() !== el || this.lastActiveElement !== el;
            this.endClickWatch();
            LOG.event('click-effect', { seen: moved, hint: !moved });
            if (!moved) this.showDoubleClickHint(el);
        }, rules.CLICK_EFFECT_MS);

        this.clickWatch = () => {
            clearTimeout(timer);
            observer.disconnect();
            window.removeEventListener('pagehide', left);
            window.removeEventListener('blur', left);
            if (nav) nav.removeEventListener('navigate', left);
        };
    }

    endClickWatch() {
        const stop = this.clickWatch;
        this.clickWatch = null;
        if (stop) stop();
    }

    /** Enter twice as a picture: the key pressing down twice, and x2. */
    showDoubleClickHint(el) {
        const rect = this.rectOf(el);
        if (rect.width === 0 && rect.height === 0) return;
        this.showKeyHint(rect, 'Press Enter twice to double-click', [['Enter \u21B5']], '\u00D72', true);
    }

    /**
     * A note beside rect, under it or above when there is no room below: key
     * caps, then a mark such as x2. A picture rather than a sentence, so
     * there is nothing to read; label keeps the words for screen readers.
     * keys is a list of chords, each a list of keys drawn joined.
     */
    showKeyHint(rect, label, keys, mark, press = false) {
        this.hideHint();
        if (!document.body) return;

        const hint = document.createElement('div');
        hint.id = 'tui-hint';
        hint.setAttribute('role', 'status');
        hint.setAttribute('aria-label', label);
        keys.forEach(chord => hint.appendChild(this.keyChord(chord, press)));
        if (mark) {
            const tail = document.createElement('span');
            tail.className = 'tui-hint-mark';
            tail.setAttribute('aria-hidden', 'true');
            tail.textContent = mark;
            hint.appendChild(tail);
        }
        document.body.appendChild(hint);
        this.hint = hint;

        const gap = 6;
        const below = rect.bottom + gap + hint.offsetHeight <= window.innerHeight;
        const top = below ? rect.bottom + gap : rect.top - gap - hint.offsetHeight;
        const left = Math.max(gap, Math.min(rect.left, window.innerWidth - hint.offsetWidth - gap));
        hint.style.top = `${Math.max(gap, top) + (window.scrollY || 0)}px`;
        hint.style.left = `${left + (window.scrollX || 0)}px`;
        requestAnimationFrame(() => hint.classList.add('tui-hint-visible'));

        this.hintTimer = setTimeout(() => this.hideHint(), 3000);
    }

    /** Key caps side by side, as a chord such as Ctrl C is drawn. */
    keyChord(keys, press = false) {
        const chord = document.createElement('span');
        chord.className = 'tui-hint-chord';
        chord.setAttribute('aria-hidden', 'true');
        keys.forEach(name => {
            const key = document.createElement('span');
            key.className = press ? 'tui-hint-key tui-hint-press' : 'tui-hint-key';
            key.textContent = name;
            chord.appendChild(key);
        });
        return chord;
    }

    hideHint() {
        clearTimeout(this.hintTimer);
        if (this.hint) this.hint.remove();
        this.hint = null;
    }

    /*
     * TEXT MODE (see text-rules.js)
     *
     * The arrows move a caret through the page's text rather than the ring
     * between controls. The selection is the page's own, made with
     * Selection.modify, so Ctrl+C and everything else that works on a
     * selection works on it too.
     */
    enterTextMode(e) {
        const rules = window.TuiTextRules;
        const sel = window.getSelection();
        if (!rules || !sel || !document.body) return;
        this.endClickWatch();
        this.hideHint();

        const start = this.textStartPoint();
        if (start) {
            try {
                sel.collapse(start.node, start.offset);
            } catch (err) {
                sel.removeAllRanges();
            }
        }
        if (!start || !sel.rangeCount) {
            // Nothing on screen can be selected (a page of pictures, or text
            // marked user-select: none).
            const at = this.lastActiveElement && this.lastActiveElement.isConnected
                ? this.rectOf(this.lastActiveElement)
                : { left: 16, top: 16, right: 16, bottom: 16, width: 0, height: 0 };
            LOG.event('text-mode', { on: false, why: 'no-text-here' });
            this.showKeyHint(at, 'There is no text here to select', [['\u21E7', '\u2190\u2192']], '\u2715');
            return;
        }

        this.textMode = { marking: false };
        LOG.event('text-mode', { on: true, from: e ? 'shift-arrow' : 'menu' });
        this.isActiveMode = true;
        this.userHasActed = true;
        if (this.spotlight) this.spotlight.style.display = 'none';
        this.onTextCopy = () => this.showCopied();
        document.addEventListener('copy', this.onTextCopy, true);
        this.showTextBadge();

        // The Shift+arrow that started it counts: it selects its first step.
        const action = e ? rules.textAction(e, false) : null;
        if (action && action.type === 'move') {
            this.moveCaret(action);
        } else {
            this.updateCaret(true);
        }
    }

    /** Leaves text mode; ringBack puts the ring on the control nearest the caret. */
    exitTextMode(ringBack) {
        if (!this.textMode) return;
        const sel = window.getSelection();
        const at = sel && sel.rangeCount ? this.caretRect(sel.focusNode, sel.focusOffset) : null;

        this.textMode = null;
        LOG.event('text-mode', { on: false, ringBack: !!ringBack });
        document.removeEventListener('copy', this.onTextCopy, true);
        this.onTextCopy = null;
        if (this.caret) this.caret.remove();
        this.caret = null;
        if (this.textBadge) this.textBadge.remove();
        this.textBadge = null;
        this.hideHint();
        if (sel) sel.removeAllRanges();

        if (ringBack) this.ringNear(at);
    }

    handleTextKey(e) {
        this.hideHint();
        const action = window.TuiTextRules.textAction(e, this.textMode.marking);
        // Not ours: the page has it. Ctrl+C copies the selection that way.
        if (!action) return;
        // Tab moves focus, and the ring should follow it rather than a caret
        // stay behind; the page still gets the key.
        if (action.type === 'leave') {
            this.exitTextMode(false);
            return;
        }

        e.preventDefault();
        e.stopImmediatePropagation();
        if (action.type === 'exit') {
            this.exitTextMode(true);
        } else if (action.type === 'mark') {
            this.markText();
        } else {
            this.moveCaret(action);
        }
    }

    moveCaret(action) {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) {
            this.exitTextMode(true);
            return;
        }
        sel.modify(action.alter, action.direction, action.granularity);
        this.updateCaret(true);
    }

    /**
     * Enter: with something selected, copies it and lets go of the anchor.
     * With nothing selected, drops an anchor, so the plain arrows select
     * from here as if Shift were held; Enter again without having moved
     * picks it up.
     */
    markText() {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        // What was selected is never logged, only that it was copied.
        if (!sel.isCollapsed) {
            this.textMode.marking = false;
            LOG.event('text-copy', {});
            this.copySelection(sel);
        } else {
            this.textMode.marking = !this.textMode.marking;
            LOG.event('text-anchor', { set: this.textMode.marking });
        }
        this.updateTextBadge();
        this.updateCaret();
    }

    copySelection(sel) {
        // execCommand runs inside the key press, which is what lets a page
        // copy, and fires the copy event that shows the tick (onTextCopy).
        let copied = false;
        try {
            copied = document.execCommand('copy');
        } catch (err) {
            copied = false;
        }
        if (!copied && navigator.clipboard) {
            navigator.clipboard.writeText(sel.toString()).then(() => this.showCopied(), () => {});
        }
    }

    showCopied() {
        const sel = window.getSelection();
        const at = sel && sel.rangeCount ? this.caretRect(sel.focusNode, sel.focusOffset) : null;
        if (!at) return;
        this.showKeyHint(at, 'Copied', [['Ctrl', 'C']], '\u2713');
    }

    /**
     * Where the caret starts: the first text under the ring, otherwise the
     * first text on screen from the ring's top down (from the top of the
     * window when there is no ring).
     */
    textStartPoint() {
        const rules = window.TuiTextRules;
        const ring = this.lastActiveElement && this.lastActiveElement.isConnected &&
            this.lastActiveElement !== document.body ? this.lastActiveElement : null;
        const point = (node) => node ? { node, offset: rules.firstCharOffset(node) } : null;

        if (ring) {
            const inside = this.firstText(ring, () => true);
            if (inside) return point(inside);
        }
        const top = ring ? Math.max(0, this.rectOf(ring).top) : 0;
        const onScreen = (r) =>
            r.bottom > top && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
        // With no ring, the page's main content rather than whatever is first
        // on screen: on Wikipedia that was the search button, and the caret
        // then went down the contents sidebar, which comes first in the page.
        const main = !ring && document.querySelector('main, [role="main"]');
        const inMain = main ? this.firstText(main, onScreen) : null;
        return point(inMain || this.firstText(document.body, onScreen));
    }

    /** The first text node under root that can be selected, is drawn, and whose box passes where. */
    firstText(root, where) {
        const rules = window.TuiTextRules;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        const MAX_NODES = 20000;
        for (let i = 0, node = walker.nextNode(); node && i < MAX_NODES; i++, node = walker.nextNode()) {
            if (!rules.isReadableText(node)) continue;
            const style = window.getComputedStyle(node.parentElement);
            if (style.userSelect === 'none' || style.visibility === 'hidden') continue;
            range.selectNodeContents(node);
            const rect = range.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && where(rect)) return node;
        }
        return null;
    }

    /**
     * The box of a caret at (node, offset), in the window. A collapsed range
     * often has no box at the edge of a line, so the character beside it is
     * measured instead.
     */
    caretRect(node, offset) {
        if (!node) return null;
        const range = document.createRange();
        const box = (r, x) => ({ left: x, right: x, top: r.top, bottom: r.bottom, width: 0, height: r.height });
        try {
            range.setStart(node, offset);
            range.collapse(true);
            const own = range.getClientRects()[0];
            if (own && own.height > 0) return box(own, own.left);

            if (node.nodeType === Node.TEXT_NODE) {
                const length = node.nodeValue.length;
                if (offset < length) {
                    range.setEnd(node, offset + 1);
                    const next = range.getClientRects()[0];
                    if (next && next.height > 0) return box(next, next.left);
                }
                if (offset > 0) {
                    range.setStart(node, offset - 1);
                    range.setEnd(node, offset);
                    const prev = range.getClientRects()[0];
                    if (prev && prev.height > 0) return box(prev, prev.right);
                }
            } else if (node.getBoundingClientRect) {
                const r = node.getBoundingClientRect();
                if (r.height > 0) return box(r, r.left);
            }
        } catch (err) {
            return null;
        }
        return null;
    }

    /** Draws the caret where the selection's moving end is; scroll brings it into view. */
    updateCaret(scroll = false) {
        const sel = window.getSelection();
        if (!this.textMode || !sel || !sel.rangeCount) {
            if (this.caret) this.caret.style.display = 'none';
            return;
        }

        let rect = this.caretRect(sel.focusNode, sel.focusOffset);
        const outOfView = (r) => r.top < 0 || r.bottom > window.innerHeight;
        if (scroll && rect && outOfView(rect)) {
            // Its own box first, in case it scrolls inside one; then the page.
            const holder = sel.focusNode.nodeType === Node.ELEMENT_NODE ? sel.focusNode : sel.focusNode.parentElement;
            if (holder) holder.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            rect = this.caretRect(sel.focusNode, sel.focusOffset);
            if (rect && outOfView(rect)) {
                window.scrollBy(0, rect.top - window.innerHeight / 2);
                rect = this.caretRect(sel.focusNode, sel.focusOffset);
            }
        }

        if (!this.caret || !this.caret.isConnected) {
            this.caret = document.createElement('div');
            this.caret.id = 'tui-caret';
            document.body.appendChild(this.caret);
        }
        if (!rect) {
            this.caret.style.display = 'none';
            return;
        }
        const color = this.spotlight && this.spotlight.style.getPropertyValue('--tui-ring');
        if (color) this.caret.style.setProperty('--tui-ring', color);
        this.caret.classList.toggle('tui-caret-marking', this.textMode.marking);
        this.caret.style.left = `${rect.left + (window.scrollX || 0) - 1}px`;
        this.caret.style.top = `${rect.top + (window.scrollY || 0)}px`;
        this.caret.style.height = `${rect.height}px`;
        this.caret.style.display = 'block';
    }

    /** The mode's sign in the corner, which is also its key list, drawn as keys. */
    showTextBadge() {
        if (!this.textBadge || !this.textBadge.isConnected) {
            this.textBadge = document.createElement('div');
            this.textBadge.id = 'tui-text-badge';
            this.textBadge.setAttribute('role', 'status');
            document.body.appendChild(this.textBadge);
        }
        this.updateTextBadge();
    }

    updateTextBadge() {
        const badge = this.textBadge;
        if (!badge || !this.textMode) return;
        const marking = this.textMode.marking;
        badge.textContent = '';
        badge.classList.toggle('tui-text-marking', marking);
        badge.setAttribute('aria-label', marking
            ? 'Text mode, selecting: arrows select, Enter copies, Escape leaves'
            : 'Text mode: Shift and arrows select, Enter starts selecting, Ctrl C copies, Escape leaves');

        const title = document.createElement('span');
        title.className = 'tui-text-title';
        title.setAttribute('aria-hidden', 'true');
        title.textContent = marking ? '\u25CF TEXT' : 'TEXT';
        badge.appendChild(title);

        const item = (keys, what) => {
            const group = document.createElement('span');
            group.className = 'tui-text-item';
            group.appendChild(this.keyChord(keys));
            const label = document.createElement('span');
            label.setAttribute('aria-hidden', 'true');
            label.textContent = what;
            group.appendChild(label);
            badge.appendChild(group);
        };
        if (marking) {
            item(['\u2190\u2191\u2193\u2192'], 'select');
            item(['Enter \u21B5'], 'copy');
        } else {
            item(['\u21E7', '\u2190\u2192'], 'select');
            item(['Enter \u21B5'], 'mark');
            item(['Ctrl', 'C'], 'copy');
        }
        item(['Esc'], 'exit');
    }

    /** Back from text mode: the ring goes on the control on screen nearest to where the caret was. */
    ringNear(at) {
        this.candidatesDirty = true;
        this.refreshCandidates();
        let target = null;
        if (at) {
            let best = Infinity;
            this.candidates.forEach(c => {
                const r = this.rectOf(c);
                if (window.TuiViewRules && !window.TuiViewRules.onScreen(r)) return;
                const dx = Math.max(r.left - at.left, 0, at.left - r.right);
                const dy = Math.max(r.top - at.bottom, 0, at.top - r.bottom);
                const d = dx * dx + dy * dy;
                if (d < best) {
                    best = d;
                    target = c;
                }
            });
        }
        if (!target && this.lastActiveElement && this.lastActiveElement.isConnected) {
            target = this.lastActiveElement;
        }
        this.isActiveMode = true;
        if (target) this.focusElement(target);
    }

    handleInteraction(e) {
        // Sync internal state with system focus on user interactions
        if (!this.isEnabled) return;

        // Disable "Active Mode" on mouse interaction so the green ring doesn't annoy mouse users
        // Only a real mouse. Enter clicks through simulateClick, whose events
        // are untrusted, and picking a radio with Enter hid the ring it was
        // pressed from.
        if ((e.type === 'mousedown' || e.type === 'click') && e.isTrusted) {
            // The mouse selects for itself; a caret left behind would only
            // fight it.
            this.exitTextMode(false);
            this.isActiveMode = false;
            this.userHasActed = true;   // the focus is theirs now, see isInEdgeBar
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

            const active = this.deepActiveElement();
            // Check if focus has moved to a new meaningful element
            // A label that stands in for its own tiny control (see the label
            // redirect in focusElement) is where the ring belongs.
            const standIn = this.lastActiveElement && this.lastActiveElement.control === active;
            if (active && active !== this.lastActiveElement && active !== document.body && !standIn) {
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
        // Before any click or arrow, focus is wherever the page put it.
        const firstPress = !this.userHasActed;
        this.userHasActed = true;
        this.isActiveMode = true;

        LOG.event('navigate', {
            key: key,
            mode: mode,
            from: LOG.describe(this.lastActiveElement || this.deepActiveElement()),
            firstPress: firstPress || undefined
        });

        try {
            this.stepUntilFocused(key, mode, firstPress);
        } catch (err) {
            // Into the report, then on to the console as before.
            LOG.error('navigate', err);
            throw err;
        } finally {
            // Reset lock, even when a step threw: a lock left on stops every arrow.
            requestAnimationFrame(() => this.isNavigating = false);
        }
    }

    /** navigate()'s search: the best candidate that way, retried when focus refuses it. */
    stepUntilFocused(key, mode, firstPress) {
        // AUTO-RETRY LOOP
        // If focus fails (phantom element), we try again immediately with the next best candidate.
        // Limit to 5 attempts to prevent infinite loops or performance issues.
        let attempts = 0;
        const maxAttempts = 5;
        let success = false;

        while (attempts < maxAttempts && !success) {
            attempts++;
            if (attempts > 1) LOG.event('retry', { attempt: attempts });

            // 1. Discovery
            // Only strictly needed on first attempt or if we want to be very safe,
            // but refreshing candidates is relatively cheap if dirty flag is managed.
            this.refreshCandidates();

            // 2. Current Position - PREFER internal tracking
            let current = this.lastActiveElement;
            if (!current || !current.isConnected) {
                current = this.deepActiveElement();
            }

            // Clear stale wrapper state if the wrapper is no longer focused.
            // This handles popup close/reopen: _tui_input persists on the DOM node,
            // causing SELECT to be wrongly excluded on the next navigation.
            if (current && current._tui_input && current !== this.deepActiveElement()) {
                current._tui_input = null;
                current = this.deepActiveElement();
            }

            let currentRect = null;
            if (current && current !== document.body && !this.isLayoutWrapper(current) &&
                !(firstPress && (this.isInEdgeBar(current) || this.isOutOfSight(current)))) {
                currentRect = this.rectOf(current);
            }

            // The element under the ring was hidden or removed since it got
            // there. Start from where it was drawn rather than from the corner
            // of the page, or from the top as if nothing had been focused.
            const place = this.lastRingPlace;
            const emptyRect = !currentRect || (currentRect.width === 0 && currentRect.height === 0);
            if (place && emptyRect && !firstPress &&
                (!place.el.isConnected || place.el === current || current === document.body)) {
                const left = place.left - (window.scrollX || 0);
                const top = place.top - (window.scrollY || 0);
                currentRect = { left, top, right: left + place.width, bottom: top + place.height, width: place.width, height: place.height };
            } else if (emptyRect) {
                // Focus on something with no size, and no ring drawn there
                // before, is nowhere to start from. The LA Times focuses an
                // empty "Legal Terms" dialog at the foot of the page as it
                // loads, and every ArrowDown looked below the page's end.
                currentRect = null;
            }

            // The ring's element was scrolled out of the window, above it for
            // ArrowDown or below it for ArrowUp: the step carries on from the
            // window's edge, from what the user can see. On Cloudflare, after
            // a few presses scrolled past its hero, ArrowDown went from the
            // hero's button, 300px above the window, to a link of the header
            // that had slid out of sight, and the page jumped back up.
            if (currentRect && mode !== 'extreme') {
                const edge = key === 'ArrowDown' && currentRect.bottom <= 0 ? 0
                    : key === 'ArrowUp' && currentRect.top >= window.innerHeight ? window.innerHeight : null;
                if (edge !== null) {
                    currentRect = { left: currentRect.left, right: currentRect.right, width: currentRect.width,
                        top: edge - 1, bottom: edge, height: 1 };
                }
            }

            // 3. Find Best Candidate
            // Note: findBestCandidate automatically filters out elements in this.failedFocusElements
            // A wrapper that took focus for the element stepped to is that
            // step's too (Microsoft's chat box focuses the div around it).
            // Not the body, which focus falls back to when the page removes
            // the ring's element (Walmart re-renders a carousel's links):
            // the step goes on from where the ring was, not from the top.
            const placed = current && current !== document.body && !emptyRect &&
                (!this.steppedTo || !this.composedContains(current, this.steppedTo));
            let target = mode !== 'extreme' && placed ? this.firstInside(current) : null;
            if (target) this.lastRanking = undefined;
            else target = this.findBestCandidate(currentRect, key, current, mode);
            let leftBar = false;
            if (!target && mode !== 'extreme') {
                const below = this.belowBottomBar(current, currentRect, key);
                if (below) {
                    this.leavingBar = below.bar;
                    // The page's next item is often past the usual reach,
                    // since the bar sits at the bottom edge of the window.
                    try { target = this.withWiderReach(() => this.findBestCandidate(below.rect, key, current, mode)); }
                    finally { this.leavingBar = null; }
                    if (target) { currentRect = below.rect; leftBar = true; this.leftBar = below.bar; }
                }
            }
            let ranking = this.lastRanking;
            let widened;
            // Already searched as wide as it goes, and without the bar.
            if (target && mode !== 'extreme' && !leftBar && this.leavesColumnUnseen(currentRect, target, key)) {
                const wider = this.withWiderReach(() => this.findBestCandidate(currentRect, key, current, mode));
                widened = !!wider && (this.besideOrBefore(this.rectOf(wider), this.rectOf(target), key) ||
                              this.sharesColumn(current, wider, target));
                if (widened) {
                    target = wider;
                    ranking = this.lastRanking;
                }
            }
            LOG.event('candidates', { count: this.candidates.length, widened: widened, top: ranking });

            // 4. Action
            if (target) {
                // Try to focus. access result to see if we should stop or retry.
                const focusResult = this.focusElement(target, attempts);

                if (focusResult) {
                    success = true;
                    this.steppedTo = target;   // see firstInside
                    if (this.leftBar && (!this.leftBar.isConnected || this.composedContains(this.leftBar, target))) this.leftBar = null;
                    // Remember the axis for Home/End. A jump counts the same as a
                    // step: both leave the ring travelling in that direction.
                    this.lastDirection = key;
                    this.lastArrivalAt = Date.now();
                    // Metric Tracking
                    this.safeSendMessage({
                        type: 'METRIC_EVENT',
                        payload: { action: 'NAVIGATE', key: key }
                    });
                }
                // Otherwise focus failed. The element was added to failedFocusElements inside
                // focusElement(), so the loop's next pass skips it.
            } else if (mode === 'extreme') {
                // Home/End stop at the end of the line rather than scrolling on.
                // Scrolling here would turn a second press into a page-down,
                // which is not what the key was asked to do.
                LOG.event('stay', { why: 'end-of-line' });
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
    }

    /**
     * Whether an up/down step is about to leave the column for something out
     * of sight. Candidates reach only half a window past the edge (see
     * view-rules.js), so from a tall card the link straight below can be out
     * of reach while a picture in the next column is in it: on NASA's home
     * page ArrowDown left the Earth Observatory card for the Image of the Day,
     * off-screen to the right, over Browse Image Archive below the card.
     */
    leavesColumnUnseen(currentRect, target, key) {
        if ((key !== 'ArrowDown' && key !== 'ArrowUp') || !currentRect || !window.TuiLineRules) return false;
        const rect = this.rectOf(target);
        if (window.TuiLineRules.crossGap(currentRect, rect, window.TuiLineRules.VERTICAL) === 0) return false;
        return key === 'ArrowDown' ? rect.top >= window.innerHeight : rect.bottom <= 0;
    }

    /**
     * Whether the column's own next item, found further out, belongs before
     * the unseen one in the other column: beside it, or nearer. On NASA the
     * picture sits beside Browse Image Archive, in the same section, so the
     * column wins. Microsoft stacks full-width panels with their text on
     * alternate sides, and there the other column's panel comes first: the
     * column's next item is a whole panel further, and it would skip one.
     */
    besideOrBefore(column, other, key) {
        return key === 'ArrowDown' ? column.top < other.bottom : column.bottom > other.top;
    }

    /**
     * Whether a and b sit in a container of their own that other is not in:
     * a column in the markup as well as on screen. The Verge's story stream
     * is one, down the right of the page, and its next card was further off
     * than the main column's next story; ArrowDown left the stream for it.
     * Microsoft's panels share nothing narrower than the page.
     */
    sharesColumn(a, b, other) {
        if (!a || !b || !other) return false;
        const around = new Set();
        for (let node = a; node; node = this.composedParent(node)) around.add(node);
        let common = b;
        while (common && !around.has(common)) common = this.composedParent(common);
        return !!common && common !== document.body && common !== document.documentElement &&
            !this.composedContains(common, other);
    }

    /**
     * Runs a search over candidates gathered two windows past the edges
     * instead of half of one, then goes back to the usual reach. Used when the
     * usual reach offers only something out of sight in another column, so
     * the column's own next item can compete on the same score.
     */
    withWiderReach(search) {
        this.reachRatio = 2;
        this.candidatesDirty = true;
        try {
            this.refreshCandidates();
            return search();
        } finally {
            this.reachRatio = undefined;
            this.candidatesDirty = true;
        }
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
     * Where el is drawn. Usually its own box; for an inline element whose box
     * collapsed around block children, the box of those children (see
     * unionRect in view-rules.js).
     */
    rectOf(el) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) {
            const stretched = this.stretchedRect(el);
            if (stretched) return stretched;
        }
        if (!el.children || !el.children.length || !window.TuiViewRules) return rect;
        const head = this.cellHeadRect(el, rect);
        if (head) return head;
        const display = window.getComputedStyle(el).display;
        if (display !== 'inline' && display !== 'contents') return rect;
        // Not only when the box is empty. ynet wraps each lead photo in an
        // inline <a> whose own box is the 11px line under the block <img>,
        // so the ring was a strip below the picture and the arrows measured
        // from it. Children taken out of the flow are left out: a
        // screen-reader label parked at -9999px would stretch the box.
        const empty = rect.width < 4 || rect.height < 4;
        const parts = Array.from(el.children)
            .filter(c => !/absolute|fixed/.test(window.getComputedStyle(c).position))
            .map(c => c.getBoundingClientRect());
        if (!empty) parts.push(rect);
        return window.TuiViewRules.unionRect(rect, parts);
    }

    /**
     * A grid cell with controls of its own below its content is drawn as
     * that content alone. GitHub's diff puts a review thread in the cell of
     * the line it is on: the cell grew around it, the ring took in the whole
     * thread, and ArrowDown, measured from the cell's bottom, jumped past
     * the replies and "Write a reply" to the next line.
     */
    cellHeadRect(el, rect) {
        if (el.getAttribute('role') !== 'gridcell') return null;
        const flow = Array.from(el.children)
            .filter(c => !/absolute|fixed/.test(window.getComputedStyle(c).position));
        const i = flow.findIndex(c => c.querySelector('a, button, input, select, textarea, [contenteditable]:not([contenteditable="false"])'));
        if (i < 1) return null;
        const bottom = flow[i].getBoundingClientRect().top;
        if (bottom - rect.top < 4) return null;
        return { left: rect.left, top: rect.top, right: rect.right, bottom, width: rect.width, height: bottom - rect.top, x: rect.x, y: rect.y };
    }

    /**
     * The box of an empty link that is clicked through a pseudo-element laid
     * over something bigger: the "stretched link" (Bootstrap and many news
     * sites). The Verge draws every story in its stream so, an empty <a>
     * whose ::after covers the card, and with its own 0x0 box each was
     * dropped as a 1px helper; ArrowDown from LATEST passed the whole stream
     * for the privacy banner. The pseudo-element's offsets and size come
     * resolved in pixels, relative to the padding box of its containing block.
     */
    stretchedRect(el) {
        for (const which of ['::after', '::before']) {
            const ps = window.getComputedStyle(el, which);
            if (ps.content === 'none' || ps.content === 'normal' || ps.display === 'none') continue;
            if (ps.position !== 'absolute' || ps.visibility === 'hidden' || ps.pointerEvents === 'none') continue;

            const px = (v) => parseFloat(v) || 0;
            let width = parseFloat(ps.width);
            let height = parseFloat(ps.height);
            const left = parseFloat(ps.left);
            const top = parseFloat(ps.top);
            if (!(width >= 4 && height >= 4) || isNaN(left) || isNaN(top)) continue;
            if (ps.boxSizing !== 'border-box') {
                width += px(ps.paddingLeft) + px(ps.paddingRight) + px(ps.borderLeftWidth) + px(ps.borderRightWidth);
                height += px(ps.paddingTop) + px(ps.paddingBottom) + px(ps.borderTopWidth) + px(ps.borderBottomWidth);
            }

            // The nearest positioned box, the element itself included.
            let block = el;
            while (block && block !== document.documentElement && window.getComputedStyle(block).position === 'static') {
                block = this.composedParent(block);
            }
            if (!block || block === document.documentElement) continue;

            const box = block.getBoundingClientRect();
            const x = box.left + block.clientLeft + left + px(ps.marginLeft);
            const y = box.top + block.clientTop + top + px(ps.marginTop);
            return { left: x, top: y, right: x + width, bottom: y + height, width, height, x, y };
        }
        return null;
    }

    /**
     * Whether a box around el that hides or scrolls its overflow keeps el out
     * of sight: 'clipped' when it is drawn nowhere the ring could go,
     * 'scrollable' when it is out of view inside a box the ring is also in,
     * and 'visible' otherwise.
     *
     * A box that hides its overflow clips for good. A box that scrolls clips
     * only for a ring outside it: from inside, the next card of a carousel
     * that scrolls its own box is one step away and scrolls in (BBC, and
     * weather.com's hourly forecast); from outside, those hours scrolled off
     * to the left pulled ArrowLeft 700px up from a daily row. A scrollable
     * one is not "covered" by what the window shows at its place either,
     * which on weather.com was the column beside the carousel.
     */
    clipState(el, rect, currentEl) {
        // A sliver at the edge is not something to step to.
        const SLIVER = 8;
        const hides = /hidden|clip/;
        const scrolls = /auto|scroll/;
        for (let node = this.composedParent(el); node && node !== document.body && node !== document.documentElement; node = this.composedParent(node)) {
            if (node.nodeType !== 1) continue;
            const style = window.getComputedStyle(node);
            const inside = !!currentEl && this.composedContains(node, currentEl);
            const clipsX = hides.test(style.overflowX) || scrolls.test(style.overflowX);
            const clipsY = hides.test(style.overflowY) || scrolls.test(style.overflowY);
            if (!clipsX && !clipsY) continue;

            const box = node.getBoundingClientRect();
            const out = (clipsX && Math.min(rect.right, box.right) - Math.max(rect.left, box.left) < SLIVER) ||
                        (clipsY && Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top) < SLIVER);
            const scrollable = scrolls.test(style.overflowX + ' ' + style.overflowY);

            if (scrollable && inside) {
                // Scrolling this box brings el in, whatever hides past it.
                return out ? 'scrollable' : 'visible';
            }
            if (out) return 'clipped';
        }
        return 'visible';
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
            iter = this.composedParent(iter);
        }
        return false;
    }

    /*
     * Shadow DOM. MSN builds its whole front page from web components: of 185
     * links, none sits in the document itself, all are inside shadow roots. A
     * search of the document found nothing, so the ring never appeared and the
     * arrows only scrolled. The helpers below see through shadow roots where
     * the plain DOM APIs stop at the host. On a page without shadow DOM each
     * one behaves exactly like the API it replaces.
     */

    /** The shadow root hosted by el, open or closed, or null. */
    shadowRootOf(el) {
        if (el.shadowRoot) return el.shadowRoot;
        try {
            // Content scripts may read closed roots too (Cloudflare's
            // challenge checkbox lives in one).
            if (chrome.dom && typeof chrome.dom.openOrClosedShadowRoot === 'function') {
                return chrome.dom.openOrClosedShadowRoot(el) || null;
            }
        } catch (e) {
            // Not an element that can host one.
        }
        return null;
    }

    /** Starts watching shadow roots the observer does not cover yet. */
    observeShadowRoots(scopes) {
        if (!this.observer) return;
        if (!this.observedRoots) this.observedRoots = new WeakSet();
        scopes.forEach(scope => {
            if (scope === document || this.observedRoots.has(scope)) return;
            this.observedRoots.add(scope);
            this.observer.observe(scope, this.observerOptions);
        });
    }

    /** Every shadow root on the page, nested ones included. */
    shadowRoots() {
        const roots = [];
        const visit = (scope) => {
            scope.querySelectorAll('*').forEach(el => {
                const root = this.shadowRootOf(el);
                if (root) {
                    roots.push(root);
                    visit(root);
                }
            });
        };
        visit(document);
        return roots;
    }

    /** The element that really has focus, inside whatever shadow roots hold it. */
    deepActiveElement() {
        let active = document.activeElement;
        while (active) {
            const root = this.shadowRootOf(active);
            if (!root || !root.activeElement) break;
            active = root.activeElement;
        }
        return active;
    }

    /** elementFromPoint that does not stop at a shadow host. */
    deepElementFromPoint(x, y) {
        let el = document.elementFromPoint(x, y);
        while (el) {
            const root = this.shadowRootOf(el);
            const inner = root && typeof root.elementFromPoint === 'function' ? root.elementFromPoint(x, y) : null;
            if (!inner || inner === el) break;
            el = inner;
        }
        return el;
    }

    /** parentElement, stepping from a shadow root's top out to its host. */
    composedParent(node) {
        if (!node) return null;
        if (node.parentElement) return node.parentElement;
        const parent = node.parentNode;
        return parent && parent.host ? parent.host : null;
    }

    /** a.contains(b), counting what sits in shadow roots under a. */
    composedContains(a, b) {
        for (let node = b; node; node = this.composedParent(node)) {
            if (node === a) return true;
        }
        return false;
    }

    /** el.closest(selector), continuing past shadow roots. */
    composedClosest(el, selector) {
        for (let node = el; node; node = this.composedParent(node)) {
            if (node.matches && node.matches(selector)) return node;
        }
        return null;
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
            // Not radio: there an arrow picks the next option, so stepping onto
            // Wikipedia's theme radios and pressing Up to leave switched the
            // page to another theme, and the arrows never left the group.
            // The ring steps between them instead, and Enter picks one.
            const trapTypes = [
                'text', 'search', 'password', 'email', 'url', 'tel',
                'number', 'date', 'month', 'week', 'time', 'datetime-local',
                'color', 'range'
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
        // A frame always looks empty from outside: what it holds is another
        // document. Target's bot check, a fixed frame placed after a link, was
        // taken for a touch target over that link.
        const semanticInteractive = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'IFRAME', 'FRAME'];
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
        // The document and every shadow root in it (see shadowRoots). The
        // observer only watches the document, so each root is watched too,
        // or a feed filling in inside a component would never mark us dirty.
        const scopes = [document, ...this.shadowRoots()];
        this.observeShadowRoots(scopes);
        let all = scopes.flatMap(scope => Array.from(scope.querySelectorAll(selector)));

        // Items of a tree, listbox or menu whose container keeps the only
        // tabindex (Google Drive's sidebar). They have no tabindex, so the
        // search above misses them. focusElement gives them one on arrival.
        const targetRules = window.TuiTargetRules;
        if (targetRules) {
            const known = new Set(all);
            scopes.flatMap(scope => Array.from(scope.querySelectorAll(targetRules.OWNED_ITEM_SELECTOR))).forEach(item => {
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
            // Hidden parent. A fixed element has no offsetParent either,
            // however visible: Target's full-window bot check is a fixed
            // <iframe>, and with it dropped there was no way to reach it.
            // Whether it is really shown is checked below.
            if (el.offsetParent === null && window.getComputedStyle(el).position !== 'fixed') {
                return false;
            }

            const rect = this.rectOf(el);

            // FILTER: Negative Tabindex on native controls (unless part of a widget)
            // This excludes helper inputs used by libraries (e.g. Jira, React-Select)
            if (el.getAttribute('tabindex') === '-1') {
                // Allow if currently focused (user is already there)
                if (this.deepActiveElement() !== el) {
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
            if (style.display === 'none' || style.visibility === 'hidden') {
                return false;
            }
            // A see-through input is how custom controls are drawn: the real
            // input sits invisible over or beside a styled box, and Tab
            // reaches it. Wikipedia's Appearance radios are all of these, and
            // Amazon draws every button that way, the product thumbnails and
            // "Add to Cart" included, at opacity 0.01.
            if (opacity < 0.05 && !(el.tagName === 'INPUT' && el.type !== 'hidden' && !el.disabled)) {
                return false;
            }

            // FILTER: Parent explicitly marked as non-focusable (often hides internal inputs)
            // This fixes Jira resize handles where a SPAN[tabindex="-1"] wraps a hidden INPUT
            if (el.parentElement && el.parentElement.getAttribute('tabindex') === '-1') {
                // Exception: TUI itself set this wrapper (shouldTrapArrows pattern).
                // parent._tui_input === el means we own this tabindex, so never filter it.
                if (el.parentElement._tui_input === el) {
                    // allow through
                } else if (el.getAttribute('tabindex') === '0') {
                    // It put itself in the tab order, so it is no hidden
                    // helper. YouTube's sidebar entries are paper-items with
                    // tabindex=0 inside an <a tabindex=-1>, and every one was
                    // dropped: ArrowDown went from the menu to the footer.
                } else if (this.isGridCellControl(el)) {
                    // The wrapper's -1 is the grid's doing.
                } else if (!el.isContentEditable) {
                    // Exception: contenteditable elements inside a tabindex=-1 wrapper are REAL
                    // interactive inputs (e.g. Telegram's message box). The wrapper uses tabindex=-1
                    // purely for programmatic focus management — not to hide the element.
                    // Never filter these out; they are valid navigation targets.
                    const parentRole = el.parentElement.getAttribute('role');
                    const validParentRoles = ['row', 'grid', 'list', 'menu', 'menubar', 'tablist', 'treegrid'];
                    if (!parentRole || !validParentRoles.includes(parentRole)) {
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
            if (this.deepActiveElement() !== el) {
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
                if (!window.TuiViewRules.withinReach(rect, undefined, this.reachRatio)) return false;
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
                } else if (this.isGridCellControl(el)) {
                    // GitHub hides a review thread's buttons from screen
                    // readers, not from the eye or the mouse.
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
            if (el.getAttribute('aria-hidden') === 'true' && !this.isGridCellControl(el)) {
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
        LOG.detail('candidates-refreshed', { count: this.candidates.length });
    }

    findBestCandidate(currentRect, key, currentEl, mode) {
        // The closest few, for the log; set only when there was a contest.
        this.lastRanking = undefined;
        if (!currentRect) {
            // Corner case: No focus. Pick top-left most visible element or first one.
            // If we have no origin, we can't do directional relative navigation effectively.
            // Fallback: Pick the first candidate in the list (usually top-left in DOM order).
            // Candidates now reach past the fold, so prefer one the user can see
            // before falling back to the first of them.
            // And one nothing lies over: with a dialog or a bot check over
            // the page (Target), the first press went to the page's first
            // button, out of sight behind it.
            // Without the ones that just refused focus, or a retry picks the
            // same one again.
            const onScreen = window.TuiViewRules
                ? this.candidates.filter(c => !this.failedFocusElements.has(c) && window.TuiViewRules.onScreen(this.rectOf(c)))
                : [];
            // Tested at the middle of the part on screen: a carousel card
            // half past the left edge has its middle off the window, where
            // nothing is hit, and it passed as uncovered. On Rotten Tomatoes
            // the first press went to one, behind the cookie wall's backdrop.
            const uncovered = onScreen.filter(c => {
                const r = this.rectOf(c);
                const x = (Math.max(r.left, 0) + Math.min(r.right, window.innerWidth)) / 2;
                const y = (Math.max(r.top, 0) + Math.min(r.bottom, window.innerHeight)) / 2;
                const hit = this.deepElementFromPoint(x, y);
                return !!hit && (hit === c || this.composedContains(c, hit) || this.composedContains(hit, c));
            });
            // By where it is drawn, not where it is in the markup: a card
            // pinned to a corner often comes before the header (LinkedIn).
            if (uncovered.length) {
                const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
                return uncovered[window.TuiViewRules.firstInReadingOrder(uncovered.map(c => this.rectOf(c)), rtl)];
            }
            return onScreen[0] || (this.candidates.length > 0 ? this.candidates[0] : null);
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
        const scored = [];

        // Determine if we are currently starting from a sticky/fixed context (e.g. Header)
        // BUG FIX: Also treat semantic navigation regions (HEADER, NAV) as "Sticky/Anchor" regions.
        // This ensures that navigating FROM a header (even if not CSS sticky) to a sticky sidebar doesn't incur a penalty.
        const currentIsSticky = currentEl ? (this.isSticky(currentEl) || !!this.composedClosest(currentEl, 'header, nav, [role="banner"], [role="navigation"]')) : false;

        const cover = this.windowCover();

        this.candidates.forEach(cand => {
            // Stepping down out of a bar pinned to the bottom: not back into it.
            if (this.leavingBar && this.composedContains(this.leavingBar, cand)) return;
            // Nor, once left, on the next steps down the page: on PayPal
            // ArrowDown went back and forth between the page and its cookie
            // strip, which lies below everything on screen. Up still reaches
            // it, and so does Down at the end of the page.
            if (this.leftBar && key === 'ArrowDown' && this.composedContains(this.leftBar, cand) &&
                this.canScrollPage(key)) return;

            // Skip self - ENHANCED to prevent navigation loops
            // Check multiple conditions:
            // 1. Don't select lastActiveElement (tracked wrapper)
            if (cand === this.lastActiveElement) {
                return;
            }

            // 2. Don't select the actual DOM focused element
            if (cand === this.deepActiveElement()) {
                return;
            }

            // 3. If lastActiveElement is a wrapper with a child input, skip both wrapper AND child
            if (this.lastActiveElement && this.lastActiveElement._tui_input) {
                if (cand === this.lastActiveElement._tui_input) {
                    return;
                }
            }

            // 4. Don't select currentEl if it was passed explicitly
            if (currentEl) {
                if (cand === currentEl) return;

                // CRITICAL FIX: Don't select ANCESTORS of the current element
                // Navigating from Input -> Parent Div/Label is almost never desired and causes loops
                if (this.composedContains(cand, currentEl)) return;

                // CRITICAL FIX: Don't select LABELs that control the current input
                if (cand.tagName === 'LABEL' && cand.getAttribute('for') === currentEl.id) return;
                // Nor, on a wrapper, the label of the input it holds: it leads
                // straight back to the same field (Booking.com's destination).
                if (cand.tagName === 'LABEL' && cand.control &&
                    (cand.control === currentEl || cand.control === currentEl._tui_input)) return;
            }

            // 5. Skip elements that recently failed to receive focus
            if (this.failedFocusElements.has(cand)) {
                return;
            }

            const rect = this.rectOf(cand);

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

            if (!isValid) return;

            // Check for Overlapping Elements (Visual Obstruction)
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const topEl = this.deepElementFromPoint(centerX, centerY);


            // The hit missed the candidate: it may have been cut away by a box
            // that hides its overflow. weather.com parks its hourly carousel's
            // back button just outside the carousel, where it cannot be seen,
            // and ArrowLeft from a daily row went 660px up to it. See
            // clipState. Nothing is hit when the middle is off the window.
            const hitSelf = topEl && (topEl === cand || this.composedContains(cand, topEl));

            // Under a cover over the whole window, only what is in it or drawn
            // above it can be used. That also rules out what is off screen,
            // where there is nothing to hit, and what sits behind a bar on
            // top of the cover, such as Reuters' consent banner.
            if (cover && !hitSelf && !this.composedContains(cover, cand)) return;
            const clip = hitSelf ? 'visible' : this.clipState(cand, rect, currentEl);
            if (clip === 'clipped') return;

            if (clip !== 'scrollable' && topEl && !this.composedContains(cand, topEl) && !this.composedContains(topEl, cand)) {
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
                    // A hover card that says it is not there does not hide what
                    // is under it either. Wikipedia's page previews stay open
                    // over the next paragraph after focus has moved on, marked
                    // aria-hidden, and every link under them was skipped.
                    let isObstructingFixed = false;
                    let obstacle = topEl;
                    while (obstacle && obstacle !== document.body) {
                        const hidden = obstacle.getAttribute && obstacle.getAttribute('aria-hidden');
                        if (hidden === '' || hidden === 'true' ||
                            (obstacle.getAttribute && obstacle.getAttribute('role') === 'tooltip')) {
                            isObstructingFixed = true;
                            break;
                        }
                        const style = window.getComputedStyle(obstacle);
                        // Nor does a cover that cannot be seen. eBay hides a
                        // carousel's disabled back arrow at opacity 0, right
                        // over the first chip, and ArrowDown passed the chip
                        // for the sidebar. Only up to the box they share: a
                        // transparent ancestor of both hides the candidate too.
                        if (parseFloat(style.opacity) < 0.05 && !this.composedContains(obstacle, cand)) {
                            isObstructingFixed = true;
                            break;
                        }
                        if (style.position === 'fixed' || style.position === 'sticky') {
                            // A bar or banner, which the page scrolls out from
                            // under. Not a cover over most of the window: on
                            // Target a bot check fills it, and ArrowDown went
                            // to a button behind it. Taller than an edge bar
                            // can be (see coveredEdges), it hides what it
                            // covers, unless the candidate is inside it.
                            // Nor a box floating in the middle of the window:
                            // the LA Times' terms dialog is one, and ArrowDown
                            // from its Privacy Policy link went to a page link
                            // behind it rather than to its Continue button.
                            // A bar lies along the top or bottom edge; a column
                            // down the side is let through as before.
                            const box = obstacle.getBoundingClientRect();
                            const maxBar = window.innerHeight * (window.TuiViewRules ? window.TuiViewRules.MAX_EDGE_OVERLAY_RATIO : 0.6);
                            const edges = window.TuiViewRules
                                ? window.TuiViewRules.coveredEdges(window.innerHeight, [box], 40) : { top: 1 };
                            const column = box.height >= box.width * 1.5;
                            const bar = box.height <= maxBar && (edges.top > 0 || edges.bottom > 0 || column);
                            isObstructingFixed = bar || this.composedContains(obstacle, cand);
                            break;
                        }
                        obstacle = this.composedParent(obstacle);
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
                // Nearly straight up or down is not left or right. See strays.
                if (window.TuiLineRules && window.TuiLineRules.strays(currentRect, rect, key)) return;

                // Nor does left or right scroll the page to another row. On
                // Walmart ArrowRight at the end of a row went 330px up to a
                // carousel arrow above the window, and on Pinterest ArrowLeft
                // from a form field scrolled 500px down to the footer's logo.
                // A pinned column beside the page (Wikipedia) is on screen.
                if ((key === 'ArrowLeft' || key === 'ArrowRight') && window.TuiLineRules && window.TuiViewRules &&
                    !window.TuiLineRules.sameLine(currentRect, rect, window.TuiLineRules.HORIZONTAL) &&
                    !window.TuiViewRules.onScreen(rect)) return;

                // Step C: The Distance/Priority Formula
                score = this.getDistance(currentRect, rect, key);

                // Penalize FIXED/STICKY elements to prevent them from hijacking navigation
                // when they visually overlap or are geometrically closer than the scrolling content.
                // BUG FIX: Only apply penalty if we are moving FROM non-sticky TO sticky.
                // If we are already in a sticky container (like Header), we should be able to move to other sticky containers (Sidebar) freely.
                if (targetIsSticky && !currentIsSticky) {
                    score += 500;

                    // A sideways step never leaves its row for a pinned bar. On
                    // USA Today, ArrowRight from the end of a sidebar row went
                    // 307px up into the masthead, because that was the only
                    // thing further right on the page, penalty or not.
                    // A pinned side column is still a column, though: on
                    // Wikipedia the sticky Appearance menu is what lies to the
                    // right of the article, and skipping it sent ArrowRight
                    // 700px up to Donate. A floating button is no column,
                    // though: Microsoft's Back to Top, pinned in the corner,
                    // took ArrowRight 420px down from a button mid-page.
                    const sideways = key === 'ArrowLeft' || key === 'ArrowRight';
                    if (sideways && window.TuiLineRules &&
                        !window.TuiLineRules.sameLine(currentRect, rect, window.TuiLineRules.axisOf(key))) {
                        const pinned = this.pinnedAncestor(cand);
                        const box = pinned ? pinned.getBoundingClientRect() : null;
                        const column = !!box && box.height >= box.width * 1.5 && box.height >= window.innerHeight * 0.3;
                        if (!column) return;
                    }

                    // A widget floating in a corner, neither a bar across the
                    // page nor a column down it, costs more again. It is always
                    // on screen, so it was always "near": ArrowDown on
                    // Microsoft's home page left a panel for Back to Top rather
                    // than the next panel's link. With nothing else that way it
                    // is still reached, but only once the page cannot scroll
                    // on: Walmart's Sparky button took ArrowDown whenever the
                    // next row was out of reach, and from a pinned button
                    // every further ArrowDown only scrolled the page under it.
                    const floating = this.pinnedAncestor(cand);
                    if (floating) {
                        const fb = floating.getBoundingClientRect();
                        const bar = fb.width >= window.innerWidth * 0.5;
                        const col = fb.height >= fb.width * 1.5 && fb.height >= window.innerHeight * 0.3;
                        if (!bar && !col) {
                            if (this.canScrollPage(key)) return;
                            score += 1000;
                        }
                    }
                }
            }

            scored.push({ cand, rect, score });

            if (score < minScore) {
                minScore = score;
                bestCandidate = cand;
            }
        });

        // Only the five nearest are described, so a long list costs a sort, not a log line each.
        this.lastRanking = scored.sort((a, b) => a.score - b.score).slice(0, 5)
            .map(s => `${LOG.describe(s.cand, s.rect)} =${Math.round(s.score)}`).join(' | ') || 'none that way';

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
        // A grid takes every control inside its cells out of the tab order
        // until the cell is entered. GitHub's diff does this, so a review
        // thread's "Write a reply" and the comments' buttons, many levels
        // below the cell, were never reached: ArrowDown skipped the thread.
        if (this.isInGridCell(el)) return true;

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

    isInGridCell(el) {
        return !!(el.parentElement && el.parentElement.closest('[role="gridcell"]'));
    }

    /**
     * A control inside a grid cell, which the grid has hidden from Tab and
     * from screen readers (tabindex=-1 and aria-hidden on it or on its
     * wrapper) while it is drawn and clickable. See isRovingTabindexMember.
     */
    isGridCellControl(el) {
        return ['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && this.isInGridCell(el);
    }

    focusElement(el, attempt = 1) {
        // A label passes focus to its control. For a text box that put the
        // arrows inside it without Enter: on Booking.com ArrowDown reached
        // the destination field's label, and from then on every arrow moved
        // the caret. Such a label is reached the way its control is: the
        // wrapper takes the ring, and Enter goes in.
        if (el.tagName === 'LABEL' && el.control && el.control !== el && this.shouldTrapArrows(el.control)) {
            return this.focusElement(el.control, attempt);
        }

        LOG.detail('focus-try', { attempt: attempt, el: LOG.describe(el) });

        // 1. Handle Virtual Focus for Trap Elements
        if (this.isTrapElement(el)) {
            // We DO NOT call el.focus() because that surrenders control to the iframe.
            // Instead, we just highlight it and keep system focus on the body (or blur current).
            this.deepActiveElement().blur();
            this.scrollToReveal(el);
            this.highlight(el);
            LOG.event('focus', { result: 'ring-only', el: LOG.describe(el) });
            return true; // Success (Virtual)
        }

        // 2. Handle Inputs (Wrapper Focus)
        // Improvement: Only wrap inputs that need arrow keys (Text, Select).
        // Buttons, checkboxes, etc. can be focused directly.
        if (this.shouldTrapArrows(el)) {
            const parent = el.parentElement;
            if (parent) {
                // Make parent focusable if not already
                if (!parent.hasAttribute('tabindex')) {
                    parent.setAttribute('tabindex', '-1');
                }

                // Link them so Enter key knows where to go
                parent._tui_input = el;

                parent.focus();

                // CRITICAL FIX: Verify wrapper focus success
                // If focus didn't move to parent (or inside it), it means parent refused focus.
                if (this.deepActiveElement() !== parent && !parent.contains(this.deepActiveElement())) {
                    this.failedFocusElements.add(el);
                    LOG.event('focus', { result: 'wrapper-refused', el: LOG.describe(el) });
                    return false; // Failed
                }

                // CRITICAL FIX: Ensure contenteditable elements don't auto-activate
                // Some browsers/sites may still try to focus the contenteditable
                // when its parent wrapper is focused. Explicitly blur it.
                if (el.isContentEditable && this.deepActiveElement() === el) {
                    el.blur();
                }

                this.scrollToReveal(parent);
                this.highlight(parent);
                LOG.event('focus', { result: 'wrapper', el: LOG.describe(el), wrapper: LOG.describe(parent) });
                return true; // Success
            }
            // No parent to wrap it in: fall through to normal focus.
        }

        // 3. Normal Focus
        // An item whose container owns focus has no tabindex, and focus() on it
        // would do nothing. Give it one, the way the widget itself would.
        if (el._tui_owned_item && !el.hasAttribute('tabindex')) {
            el.setAttribute('tabindex', '-1');
        }
        const focusBefore = this.deepActiveElement();
        el.focus();

        // Nor can a link without an href, which pages drive from a click
        // handler: Le Monde's consent wall is made of them, focus stayed on
        // the body, and the ring went round the whole page. Given a
        // tabindex, it takes focus like the control it stands for.
        // (Chrome reports tabIndex 0 for such a link, so the attribute decides.)
        // Only when focus went nowhere at all: a label hands it to its input.
        if (this.deepActiveElement() === focusBefore && focusBefore !== el &&
            el.tagName !== 'LABEL' && !el.hasAttribute('tabindex')) {
            el.setAttribute('tabindex', '-1');
            el.focus();
        }

        // CRITICAL FIX: Check if focusing this element caused a DIFFERENT element to get focus
        // This can happen with:
        // - LABELs that redirect focus to their associated INPUT (checkbox, radio)
        // - Contenteditable elements (YouTube comments, etc.)
        // - Parent wrappers that intercept focus (GitHub autocomplete, etc.)
        // - Autocomplete widgets
        // - Custom focus management in web apps
        const actualFocus = this.deepActiveElement();

        // Simple check: did focus move at all?
        // Note: actualFocus could be body if focus failed completely

        if (actualFocus !== el) {
            // SPECIAL CASE: Focus returned to the element we started from,
            // or fell back to the page itself, which is no place for the ring
            if (actualFocus === this.lastActiveElement || !actualFocus ||
                actualFocus === document.body || actualFocus === document.documentElement) {
                this.failedFocusElements.add(el);
                LOG.event('focus', { result: 'refused', el: LOG.describe(el) });
                return false; // Failed
            }

            // SPECIAL CASE: LABEL → INPUT focus redirect
            const isLabelRedirect = (el.tagName === 'LABEL' &&
                (actualFocus.tagName === 'INPUT' || actualFocus.tagName === 'TEXTAREA' || actualFocus.tagName === 'SELECT'));

            if (isLabelRedirect) {
                // Track the INPUT as lastActiveElement so we can navigate back to it,
                // unless it is too small to see. Booking.com's "travelling for
                // work" checkbox is a 1x1 input behind its label, and the ring
                // shrank to a dot: the label is what the user sees, so it keeps
                // the ring while the input keeps focus for Enter.
                const inputRect = actualFocus.getBoundingClientRect();
                const shown = (inputRect.width < 4 || inputRect.height < 4) ? el : actualFocus;
                this.lastActiveElement = shown;

                // Highlight the INPUT (the actual focused element)
                this.scrollToReveal(shown);
                this.highlight(shown);

                LOG.event('focus', { result: 'label-to-input', el: LOG.describe(el), focused: LOG.describe(actualFocus) });
                return true;
            }

            // SPECIAL CASE: focus bounced up to an ancestor.
            // Lists do this: the row owns the tabindex and the link inside it is
            // tab-unreachable, so focusing the link focuses the row. The row has
            // no click handler, so Enter on it would do nothing - remember what
            // we were actually aiming at so Enter can click that instead.
            const bounced = this.composedContains(actualFocus, el);
            actualFocus._tui_activate = bounced ? el : null;

            // Trust the browser focus (it moved somewhere valid)
            this.lastActiveElement = actualFocus;
            this.highlight(actualFocus);

            LOG.event('focus', {
                result: bounced ? 'bounced-to-container' : 'moved-elsewhere',
                el: LOG.describe(el),
                focused: LOG.describe(actualFocus)
            });
            return true;
        }

        // Focus succeeded as expected (actualFocus === el)
        // Drop any stale aim from an earlier bounce: this element is the target now.
        el._tui_activate = null;
        this.lastActiveElement = el;
        this.scrollToReveal(el);
        this.highlight(el);

        LOG.event('focus', { result: 'ok', el: LOG.describe(el) });
        return true;
    }

    handleOffScreen(key) {
        if (this.isSubframe && this.leaveFrame(key)) return;
        // The user is scrolling on, away from where the ring arrived: a
        // layout shift must not pull the page back to it (keepArrivalInView).
        // Cloudflare's animated hero shifts the layout all the time, and
        // quick presses of ArrowDown past its button scrolled 300px and
        // were pulled straight back.
        this.lastArrivalAt = 0;
        const scrollAmount = 300;
        LOG.event('scroll', { key: key, why: 'nothing-that-way' });
        if (key === 'ArrowDown') window.scrollBy({ top: scrollAmount, behavior: this.scrollBehavior() });
        if (key === 'ArrowUp') window.scrollBy({ top: -scrollAmount, behavior: this.scrollBehavior() });
        // NOTE: A re-scan happens on the NEXT keypress because scroll creates a new geometric state.
    }



    /**
     * The first thing to step to inside a box the page focused, or null.
     *
     * AP News' consent dialog focuses its own box when it opens, as dialogs
     * are meant to. Everything in it lies inside that box, so no arrow found
     * anything above, below or beside it, and the ring never got in: each
     * press scrolled the page behind instead. Focus the page put on a box
     * around other controls is somewhere to enter, at the start of its top
     * row, whichever arrow is pressed. A box an arrow stepped to is a place
     * to leave as before, so a card with buttons inside is stepped past
     * rather than into.
     */
    firstInside(box) {
        if (!box || !window.TuiViewRules) return null;
        const inside = this.candidates.filter(c => c !== box && this.composedContains(box, c) &&
            !this.failedFocusElements.has(c) && window.TuiViewRules.onScreen(this.rectOf(c)));
        // A box around one control is a wrapper that took focus for it,
        // not a place to enter. Booking re-renders its destination field, so
        // the wrapper's input is not the one stepped to, and the ring went
        // back into the field on every press.
        if (inside.length < 2) return null;
        const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
        return inside[window.TuiViewRules.firstInReadingOrder(inside.map(c => this.rectOf(c)), rtl)];
    }

    /**
     * Where ArrowDown goes on from, out of a bar pinned along the bottom of
     * the window with nothing further down in it: the bar's top edge, under
     * the ring. PayPal's cookie strip sits there without covering the page,
     * and once the ring was in it every ArrowDown only scrolled the page, as
     * whatever came into view was above the bar, never below it. From the
     * bar's top edge, the page's next item scrolls into view above it.
     * Null for anything else, and for a modal dialog, which keeps the ring.
     */
    belowBottomBar(current, currentRect, key) {
        if (key !== 'ArrowDown' || !current || !currentRect || !window.TuiViewRules || this.windowCover()) return null;
        const bar = this.pinnedAncestor(current);
        if (!bar) return null;
        try {
            if (this.composedClosest(current, 'dialog:modal, [aria-modal="true"]')) return null;
        } catch (e) {
            if (this.composedClosest(current, '[aria-modal="true"]')) return null;
        }
        const box = bar.getBoundingClientRect();
        if (!(window.TuiViewRules.coveredEdges(window.innerHeight, [box], 40).bottom > 0)) return null;
        return {
            bar,
            rect: { left: currentRect.left, right: currentRect.right, width: currentRect.width,
                top: box.top - 1, bottom: box.top, height: 1 }
        };
    }

    /** Whether the page itself has further to scroll this way. Sideways never counts. */
    canScrollPage(key) {
        const doc = document.scrollingElement || document.documentElement;
        if (key === 'ArrowDown') return window.scrollY + window.innerHeight < doc.scrollHeight - 1;
        if (key === 'ArrowUp') return window.scrollY > 0;
        return false;
    }

    /**
     * Hands the keyboard back to the page around this frame when there is
     * nothing further this way and nothing left to scroll. Enter steps into a
     * frame (see handleKeydown), and without a way back out the arrows were
     * shut inside it: MDN's live examples, a consent dialog, a bot check.
     * The parent's engine hears the message, puts the ring on this frame and
     * carries on in the same direction (see handleFrameExit).
     */
    leaveFrame(key) {
        if (this.canScrollPage(key)) return false;

        try {
            window.parent.postMessage({ tuiFrameExit: key }, '*');
            window.parent.focus();   // allowed across origins while a key is down
        } catch (e) {
            return false;
        }
        if (this.spotlight) this.spotlight.style.display = 'none';
        this.isActiveMode = false;
        return true;
    }

    /** The parent's half of leaveFrame: the frame that sent it takes the ring, then the step goes on. */
    handleFrameExit(e) {
        const key = e.data && e.data.tuiFrameExit;
        if (!this.isEnabled || !/^Arrow(Up|Down|Left|Right)$/.test(key || '')) return;

        const scopes = [document, ...this.shadowRoots()];
        const frame = scopes.flatMap(s => Array.from(s.querySelectorAll('iframe, frame')))
            .find(f => f.contentWindow === e.source);
        if (!frame) return;

        const active = this.deepActiveElement();
        if (active === frame) frame.blur();
        LOG.event('frame-exit', { key: key, frame: LOG.describe(frame) });
        this.lastActiveElement = frame;
        this.userHasActed = true;
        this.navigate(key);
    }

    broadcastStatus() {
        if (this.isSubframe) return;
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
        LOG.event('menu-action', { action: action });
        this.closeMenu();

        if (action === 'report') {
            // Background asks the top frame for its log and opens the report
            // window, which shows the user all of it before anything is saved.
            this.safeSendMessage({ type: 'OPEN_REPORT' });
        } else if (action === 'duplicate') {
            window.open(window.location.href, '_blank');
        } else if (action === 'back') {
            window.history.back();
        } else if (action === 'select-text') {
            this.enterTextMode(null);
        }
    }
}

/**
 * Consent dialogs on news sites (The Guardian's Sourcepoint banner) live in a
 * cross-origin iframe that takes focus on load. Keys then go to the frame, and
 * with the engine running in the top page only, the arrows did nothing at all:
 * no ring and no way to reach "Yes, I accept". So the engine runs in frames too.
 *
 * A page can hold dozens of frames, mostly ads, and keys only ever reach the
 * one with focus. A frame therefore starts its engine on the first arrow key
 * it receives rather than on load. A frame with a video is a player, whose
 * arrows seek and change the volume, and is left alone.
 */
function isSubframe() {
    try {
        return window.top !== window;
    } catch (e) {
        return true; // A cross-origin parent can make the comparison throw.
    }
}

// Start
if (!isSubframe()) {
    new SpatialEngine();
} else {
    const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    const startOnFirstArrow = (e) => {
        if (!ARROWS.has(e.key)) return;
        document.removeEventListener('keydown', startOnFirstArrow, true);
        if (document.querySelector('video')) return;

        const engine = new SpatialEngine({ subframe: true });
        // The engine's own listener was not there for this key yet.
        if (engine.spotlight) engine.handleKeydown(e);
    };
    document.addEventListener('keydown', startOnFirstArrow, true);
}
