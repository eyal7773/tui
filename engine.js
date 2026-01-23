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

        // State
        this.isActiveMode = false; // "Lazy Focus": only show green ring after user actively navigates with arrows
        this.lastActiveElement = null;
        this.isNavigating = false;
        this.observer = null;
        this.focusMonitorInterval = null;

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
        this.observer = new MutationObserver(() => {
            this.candidatesDirty = true;

            // Sync with active element if it changed effectively during DOM updates
            // (e.g. "New Chat" clicked -> DOM updates -> input gets focus)
            this.monitorFocusChange(500);
        });
        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class', 'hidden', 'disabled']
        });

        // Listen for storage changes to update debug mode dynamically
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local') {
                if (changes.tuiEnabled) {
                    this.isEnabled = changes.tuiEnabled.newValue !== false;
                }
            }
            if (namespace === 'session') {
                if (changes.tuiAdminMode) {
                    this.debugMode = !!changes.tuiAdminMode.newValue;
                    console.log(`[TUI] Debug Mode ${this.debugMode ? 'Enabled' : 'Disabled'}`);
                }
            }
        });

        // Broadcast initial status (always supported now)
        this.broadcastStatus();
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

    async loadSettings() {
        const localStorage = await chrome.storage.local.get(['tuiEnabled']);
        this.isEnabled = localStorage.tuiEnabled !== false;

        try {
            const sessionStorage = await chrome.storage.session.get(['tuiAdminMode']);
            this.debugMode = !!sessionStorage.tuiAdminMode;
        } catch (e) {
            console.warn('[TUI] Failed to access session storage (likely restricted context):', e);
            this.debugMode = false;
        }
    }

    handleScroll() {
        if (!this.isEnabled) return;

        // Throttled update using requestAnimationFrame to avoid performance hits during scroll
        if (!this._scrollFrameLocked) {
            this._scrollFrameLocked = true;
            requestAnimationFrame(() => {
                this._scrollFrameLocked = false;
                // Only update visual position if we are in "Active Mode" and have a target
                if (this.isActiveMode && this.lastActiveElement) {
                    this.highlight(this.lastActiveElement);
                }
            });
        }
    }

    handleKeydown(e) {
        if (!this.isEnabled) return;

        // User is interacting, stop any pending focus monitoring to avoid conflicts/lag
        this.stopFocusMonitor();

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

        if (e.key.startsWith('Arrow')) {
            // We handle this navigation action
            e.preventDefault();
            e.stopImmediatePropagation(); // CRITICAL: Stop the page from seeing this key
            this.navigate(e.key);
        } else if (e.key === 'Enter') {
            const active = document.activeElement;

            // Check if we are on a wrapper that has a stashed input
            if (active && active._tui_input) {
                e.preventDefault();
                e.stopImmediatePropagation();
                active._tui_input.focus();
                return;
            }

            // ROBUST CLICK SIMULATION
            // Many modern web apps (React, etc) listen to mousedown/mouseup or require the full event chain.
            // Simple .click() often fails on div/span elements acting as buttons.
            e.preventDefault();
            e.stopImmediatePropagation();
            if (active) this.simulateClick(active);
        }
    }

    simulateClick(el) {
        if (this.debugMode) console.log('[TUI] Simulating Click on:', el);

        // SMART TARGETING: If this is a container element (gridcell, listitem), 
        // try to find the actual interactive content inside.
        // Many web apps put tabindex="0" on a wrapper for keyboard focus,
        // but the actual click listener is on an inner div.
        let target = el;
        const role = el.getAttribute('role');
        if (role === 'gridcell' || role === 'listitem' || role === 'row') {
            // Strategy: Look for a div with classes (content wrapper) rather than empty wrapper divs
            // This works for WhatsApp, Google, and other modern web apps
            const innerContent = el.querySelector('div[class]:not([class=""])') || el.querySelector('div');
            if (innerContent) {
                if (this.debugMode) console.log('[TUI] Targeting inner content:', innerContent);
                target = innerContent;
            }
        }

        // 1. Try native click first (for <button>, <a>, <input>)
        if (typeof target.click === 'function') {
            if (this.debugMode) console.log('[TUI] Calling native .click()');
            target.click();
        }

        // 2. Dispatch a full Mouse/Pointer Event Sequence
        // Modern web apps (especially React) often require specific event properties
        const options = {
            view: window,
            bubbles: true,
            cancelable: true,
            composed: true,  // Allow events to cross shadow DOM boundaries
            buttons: 1,
            pointerType: 'mouse'  // Explicitly mark as mouse event (not pen/touch)
        };

        if (this.debugMode) console.log('[TUI] Dispatching synthetic events...');

        // Dispatch Pointer Events (standard for modern web)
        target.dispatchEvent(new PointerEvent('pointerdown', options));
        target.dispatchEvent(new MouseEvent('mousedown', options));

        target.dispatchEvent(new PointerEvent('pointerup', options));
        target.dispatchEvent(new MouseEvent('mouseup', options));

        target.dispatchEvent(new PointerEvent('click', options));
        // We also fire MouseEvent click for legacy listeners
        target.dispatchEvent(new MouseEvent('click', options));

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
    navigate(key) {
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

        // 1. Discovery
        this.refreshCandidates();

        // 2. Current Position - PREFER internal tracking to avoid losing context when focus is blurred/trapped
        let current = this.lastActiveElement;

        // Validation: If our internal tracking is garbage/gone, fall back to system focus
        if (!current || !document.body.contains(current)) {
            current = document.activeElement;
        }

        let currentRect = null;

        // Use body as fallback if body is focused or no focus.
        // Also: treat large layout wrappers as "no focus" so we start fresh discovery instead of getting stuck on them.
        if (current && current !== document.body && !this.isLayoutWrapper(current)) {
            currentRect = current.getBoundingClientRect();
        }

        // 3. Find Best Candidate
        const target = this.findBestCandidate(currentRect, key, current);

        // 4. Action
        if (target) {
            this.focusElement(target);
            // Metric Tracking
            this.safeSendMessage({
                type: 'METRIC_EVENT',
                payload: { action: 'NAVIGATE', key: key }
            });
        } else {
            // 5. Off-screen handling (scroll)
            this.handleOffScreen(key);
            // Metric Tracking (Scroll is also an action)
            this.safeSendMessage({
                type: 'METRIC_EVENT',
                payload: { action: 'SCROLL', key: key }
            });
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
        const selector = 'a, button, input, select, textarea, iframe, frame, object, embed, summary, [tabindex], [contenteditable]:not([contenteditable="false"])';
        let all = Array.from(document.querySelectorAll(selector));

        // 2. Filter candidates
        this.candidates = all.filter(el => {
            // Visibility Check
            if (el.offsetParent === null) return false; // Hidden parent

            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return false;

            // Computed style check (expensive, maybe optimize later if slow)
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

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

            // Is in viewport?
            if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
                return false;
            }

            // Filter out auxiliary UI elements (touch targets, ripples, overlays, etc.)
            if (this.isAuxiliaryElement(el)) {
                return false;
            }


            // NEW: Interactive Validation for Generic Elements
            // Many web apps use tabindex on wrapper divs for focus management,
            // but these aren't actually clickable. We need to validate them.
            const isGenericElement = ['DIV', 'SPAN', 'LI', 'TR', 'TD', 'UL', 'OL', 'NAV', 'SECTION', 'ARTICLE', 'ASIDE', 'HEADER', 'FOOTER'].includes(el.tagName);

            if (isGenericElement && el.hasAttribute('tabindex')) {
                // If it's a semantic interactive element, always keep it
                if (['INPUT', 'TEXTAREA', 'IFRAME', 'BUTTON', 'A', 'SELECT', 'SUMMARY'].includes(el.tagName)) {
                    // Keep native interactive elements
                } else {
                    // It's a generic element with tabindex.
                    // Check if it LOOKS clickable or has interactive role
                    const hasInteractiveRole = ['button', 'link', 'menuitem', 'tab', 'option', 'gridcell', 'listitem'].includes(el.getAttribute('role'));
                    const looksClickable = style.cursor === 'pointer';

                    if (!hasInteractiveRole && !looksClickable) {
                        // It's a generic wrapper with tabindex but no interactive indicators.
                        // REJECT IT to avoid noise (large containers, focus traps, etc.)
                        return false;
                    }
                }
            }

            return true;
        });

        this.candidatesDirty = false;
        if (this.debugMode) console.log(`[TUI Spatial] Candidates refreshed: ${this.candidates.length}`);
    }

    findBestCandidate(currentRect, key, currentEl) {
        if (!currentRect) {
            // Corner case: No focus. Pick top-left most visible element or first one.
            // If we have no origin, we can't do directional relative navigation effectively.
            // Fallback: Pick the first candidate in the list (usually top-left in DOM order).
            return this.candidates.length > 0 ? this.candidates[0] : null;
        }

        let bestCandidate = null;
        let minScore = Infinity;

        // Determine if we are currently starting from a sticky/fixed context (e.g. Header)
        // BUG FIX: Also treat semantic navigation regions (HEADER, NAV) as "Sticky/Anchor" regions.
        // This ensures that navigating FROM a header (even if not CSS sticky) to a sticky sidebar doesn't incur a penalty.
        const currentIsSticky = currentEl ? (this.isSticky(currentEl) || !!currentEl.closest('header, nav, [role="banner"], [role="navigation"]')) : false;

        this.candidates.forEach(cand => {
            // Skip self
            if (cand === this.lastActiveElement) return;

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

            if (!isValid) return;

            // Check for Overlapping Elements (Visual Obstruction)
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const topEl = document.elementFromPoint(centerX, centerY);

            if (topEl && !cand.contains(topEl) && !topEl.contains(cand)) {
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

            // Step C: The Distance/Priority Formula
            let score = this.getDistance(currentRect, rect, key);

            // Penalize FIXED/STICKY elements to prevent them from hijacking navigation
            // when they visually overlap or are geometrically closer than the scrolling content.
            // BUG FIX: Only apply penalty if we are moving FROM non-sticky TO sticky.
            // If we are already in a sticky container (like Header), we should be able to move to other sticky containers (Sidebar) freely.
            const targetIsSticky = this.isSticky(cand);

            if (targetIsSticky && !currentIsSticky) {
                score += 500;
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
                .slice(0, 5);

            if (ranked.length > 0) {
                console.groupCollapsed(`[TUI] Candidates Analysis (Top ${ranked.length})`);
                ranked.forEach((el, i) => {
                    const isWinner = el === bestCandidate;
                    const marker = isWinner ? '🏆 ' : `${i + 1}. `;
                    const style = isWinner ? 'color: green; font-weight: bold;' : 'color: #888;';

                    const tag = el.tagName;
                    const id = el.id ? `#${el.id}` : '';
                    let cls = '';
                    if (typeof el.className === 'string') {
                        cls = `.${el.className.split(' ').join('.')}`;
                    }
                    const scoreText = el._debugScore.toFixed(2);
                    console.log(`%c${marker}${tag}${id}${cls} [Score: ${scoreText}]`, style);
                });
                console.groupEnd();
            } else {
                console.log('[TUI] No valid candidates found in direction.');
            }

            // Cleanup
            this.candidates.forEach(c => delete c._debugScore);
        }

        return bestCandidate;
    }

    getDistance(currentRect, targetRect, direction) {
        // Edge-based distance calculation that handles different-sized elements correctly
        // by measuring the shortest edge-to-edge distance and detecting overlap.

        switch (direction) {
            case 'ArrowUp':
                // Primary: vertical gap (positive = target is above, negative = target is below/overlapping)
                const verticalGapUp = currentRect.top - targetRect.bottom;

                // Secondary: horizontal overlap/gap
                const overlapLeftUp = Math.max(targetRect.left, currentRect.left);
                const overlapRightUp = Math.min(targetRect.right, currentRect.right);
                const horizontalGapUp = overlapLeftUp < overlapRightUp
                    ? 0  // Elements overlap horizontally - perfect alignment
                    : Math.min(
                        Math.abs(targetRect.left - currentRect.right),
                        Math.abs(targetRect.right - currentRect.left)
                    );

                return verticalGapUp + (horizontalGapUp * 1.5);

            case 'ArrowDown':
                // Primary: vertical gap (positive = target is below)
                const verticalGapDown = targetRect.top - currentRect.bottom;

                // Secondary: horizontal overlap/gap
                const overlapLeftDown = Math.max(targetRect.left, currentRect.left);
                const overlapRightDown = Math.min(targetRect.right, currentRect.right);
                const horizontalGapDown = overlapLeftDown < overlapRightDown
                    ? 0  // Elements overlap horizontally
                    : Math.min(
                        Math.abs(targetRect.left - currentRect.right),
                        Math.abs(targetRect.right - currentRect.left)
                    );

                return verticalGapDown + (horizontalGapDown * 1.5);

            case 'ArrowLeft':
                // Primary: horizontal gap (positive = target is to the left)
                const horizontalGapLeft = currentRect.left - targetRect.right;

                // Secondary: vertical overlap/gap
                const overlapTopLeft = Math.max(targetRect.top, currentRect.top);
                const overlapBottomLeft = Math.min(targetRect.bottom, currentRect.bottom);
                const verticalGapLeft = overlapTopLeft < overlapBottomLeft
                    ? 0  // Elements overlap vertically
                    : Math.min(
                        Math.abs(targetRect.top - currentRect.bottom),
                        Math.abs(targetRect.bottom - currentRect.top)
                    );

                return horizontalGapLeft + (verticalGapLeft * 30);

            case 'ArrowRight':
                // Primary: horizontal gap (positive = target is to the right)
                const horizontalGapRight = targetRect.left - currentRect.right;

                // Secondary: vertical overlap/gap
                const overlapTopRight = Math.max(targetRect.top, currentRect.top);
                const overlapBottomRight = Math.min(targetRect.bottom, currentRect.bottom);
                const verticalGapRight = overlapTopRight < overlapBottomRight
                    ? 0  // Elements overlap vertically
                    : Math.min(
                        Math.abs(targetRect.top - currentRect.bottom),
                        Math.abs(targetRect.bottom - currentRect.top)
                    );

                return horizontalGapRight + (verticalGapRight * 30);

            default:
                return Infinity;
        }
    }

    isTrapElement(el) {
        // Elements that swallow focus and prevent bubbling
        return ['IFRAME', 'FRAME', 'OBJECT', 'EMBED'].includes(el.tagName);
    }

    focusElement(el) {
        // 1. Handle Virtual Focus for Trap Elements
        if (this.isTrapElement(el)) {
            // We DO NOT call el.focus() because that surrenders control to the iframe.
            // Instead, we just highlight it and keep system focus on the body (or blur current).
            document.activeElement.blur();
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            this.highlight(el);
            this.highlight(el);
            return;
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
                parent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                this.highlight(parent);
                return;
            }
        }

        // 3. Normal Focus
        el.focus();
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        this.highlight(el);
    }

    handleOffScreen(key) {
        const scrollAmount = 300;
        if (key === 'ArrowDown') window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
        if (key === 'ArrowUp') window.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
        // NOTE: A re-scan happens on the NEXT keypress because scroll creates a new geometric state.
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
}

// Start
new SpatialEngine();
