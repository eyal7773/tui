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

        document.addEventListener('keydown', (e) => this.handleKeydown(e));
        window.addEventListener('scroll', () => this.handleScroll(), { passive: true });

        // Dynamic DOM Observer
        // Marks candidates dirty so we re-scan when DOM changes
        this.observer = new MutationObserver(() => {
            this.candidatesDirty = true;
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
                document.activeElement.blur();
                e.preventDefault();
            }
            return;
        }

        if (e.key.startsWith('Arrow')) {
            e.preventDefault();
            this.navigate(e.key);
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

        // 2. Current Position
        const current = document.activeElement;
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

    refreshCandidates() {
        if (!this.candidatesDirty) return;

        // Step A: Candidate Discovery
        const selector = 'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
        const all = Array.from(document.querySelectorAll(selector));

        this.candidates = all.filter(el => {
            // Visibility Check
            if (el.offsetParent === null) return false; // Hidden parent
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return false;

            // Computed style check (expensive, maybe optimize later if slow)
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

            // Is in viewport?
            if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
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
            if (cand === document.activeElement) return;

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

    getDistance(rectA, rectB, direction) {
        const centerA = { x: rectA.left + rectA.width / 2, y: rectA.top + rectA.height / 2 };
        const centerB = { x: rectB.left + rectB.width / 2, y: rectB.top + rectB.height / 2 };

        const dHorizontal = Math.abs(centerA.x - centerB.x);
        const dVertical = Math.abs(centerA.y - centerB.y);

        // Weight (f)
        const f = 3; // Priority multiplier

        // Distance = f * Internal + External
        switch (direction) {
            case 'ArrowRight':
            case 'ArrowLeft':
                // Horizontal Move:
                // Primary Distance = dHorizontal
                // Penalty (Alignment) = dVertical
                return dHorizontal + (dVertical * f);

            case 'ArrowDown':
            case 'ArrowUp':
                // Vertical Move:
                // Primary Distance = dVertical
                // Penalty (Alignment) = dHorizontal
                return dVertical + (dHorizontal * f);

            default:
                return Infinity;
        }
    }

    focusElement(el) {
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

    highlight(el) {
        // Remove old
        document.querySelectorAll('.tui-focus-indicator').forEach(e => e.classList.remove('tui-focus-indicator'));
        // Add new
        el.classList.add('tui-focus-indicator');
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
