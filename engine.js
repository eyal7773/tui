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
        this.lastActiveElement = null;
        this.isNavigating = false;
        this.observer = null;

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

        // Handle window resize to update spotlight position if needed
        window.addEventListener('resize', () => {
            if (this.lastActiveElement) this.highlight(this.lastActiveElement);
        });

        // Dynamic DOM Observer
        // Marks candidates dirty so we re-scan when DOM changes
        this.observer = new MutationObserver(() => {
            this.candidatesDirty = true;
            // Optional: Re-align spotlight if the focused element moved/resized? 
            // For now, we trust the next recurring update or next nav action.
        });
        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class', 'hidden', 'disabled']
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
        const storage = await chrome.storage.local.get(['tuiEnabled', 'tuiDebug']);
        this.isEnabled = storage.tuiEnabled !== false;
        this.debugMode = !!storage.tuiDebug;
    }

    handleKeydown(e) {
        if (!this.isEnabled) return;

        // Ignore if user is typing in an input
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable) {
            if (e.key === 'Escape') {
                // Return focus to wrapper if possible, otherwise blur
                const parent = document.activeElement.parentElement;
                if (parent && parent.hasAttribute('tabindex')) {
                    parent.focus();
                } else {
                    document.activeElement.blur();
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
                // We let propagation happen maybe? Or stop it?
                // Actually if we are focusing an internal input, we don't want the wrapper 'click' to fire yet.
                e.stopImmediatePropagation();
                active._tui_input.focus();
            }
        }
    }

    handleScroll() {
        // Viewport moves, so geometric relationships change.
        // We must re-calculate candidate visibility/positions next time.
        this.candidatesDirty = true;
    }

    /**
     * Main Navigation Logic
     */
    navigate(key) {
        if (this.isNavigating) return;
        this.isNavigating = true;

        // 1. Discovery
        this.refreshCandidates();

        // 2. Current Position - PREFER internal tracking to avoid losing context when focus is blurred/trapped
        let current = this.lastActiveElement;

        // Validation: If our internal tracking is garbage/gone, fall back to system focus
        if (!current || !document.body.contains(current)) {
            current = document.activeElement;
        }

        let currentRect = null;

        // Use body as fallback if body is focused or no focus
        if (current && current !== document.body) {
            currentRect = current.getBoundingClientRect();
        }

        // 3. Find Best Candidate
        const target = this.findBestCandidate(currentRect, key);

        // 4. Action
        if (target) {
            this.focusElement(target);
        } else {
            // 5. Off-screen handling (scroll)
            this.handleOffScreen(key);
        }

        // Reset lock
        requestAnimationFrame(() => this.isNavigating = false);
    }

    /**
     * Detects auxiliary UI elements that shouldn't be navigation targets.
     * These are elements added by UI frameworks for visual/accessibility purposes
     * but aren't meant for direct keyboard navigation.
     */
    isAuxiliaryElement(el) {
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

        // Step A: Candidate Discovery - Expanded to include IFRAMES which are valid targets but need special handling
        const selector = 'a, button, input, select, textarea, iframe, frame, object, embed, [tabindex]:not([tabindex="-1"]), [contenteditable]:not([contenteditable="false"])';
        const all = Array.from(document.querySelectorAll(selector));

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

            return true;
        });

        this.candidatesDirty = false;
        if (this.debugMode) console.log(`[TUI Spatial] Candidates refreshed: ${this.candidates.length}`);
    }

    findBestCandidate(currentRect, key) {
        if (!currentRect) {
            // Corner case: No focus. Pick top-left most visible element or first one.
            // If we have no origin, we can't do directional relative navigation effectively.
            // Fallback: Pick the first candidate in the list (usually top-left in DOM order).
            return this.candidates.length > 0 ? this.candidates[0] : null;
        }

        let bestCandidate = null;
        let minScore = Infinity;

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
                // Obscured by something unrelated
                return;
            }

            // Step C: The Distance/Priority Formula
            const score = this.getDistance(currentRect, rect, key);

            if (score < minScore) {
                minScore = score;
                bestCandidate = cand;
            }
        });

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

                return horizontalGapLeft + (verticalGapLeft * 1.5);

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

                return horizontalGapRight + (verticalGapRight * 1.5);

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
            return;
        }

        // 2. Handle Inputs (Wrapper Focus)
        // Improvement: Don't focus inputs directly to avoid trapping arrows.
        // Focus their parent wrapper instead.
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable) {
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
        chrome.runtime.sendMessage({
            type: 'STATUS_UPDATE',
            payload: { supported: true, enabled: this.isEnabled }
        }).catch(() => { });
    }
}

// Start
new SpatialEngine();
