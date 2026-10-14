/**
 * Loaded first, before the extension's own scripts, into the timed copy of
 * the extension that tui.js builds for its timing step (see ../timing.js).
 * It is never part of the extension itself.
 *
 * Content scripts run in their own JavaScript world, with their own
 * EventTarget, MutationObserver and setTimeout. Wrapping them here times the
 * extension's own work only, never the page's:
 *
 *   load     from this script to timing-end.js: the extension's scripts
 *            evaluated, and in the top page the engine's start as well
 *   keys     each key press, every keydown listener of the extension
 *            together, and the time until the next frame was painted
 *   busy     every listener, observer, timer and animation frame callback
 *            the extension ran, added up, and the longest single one
 *
 * Promise continuations (the rest of an async function after an await) are
 * not seen, so a little of the work after chrome.storage answers is missed.
 *
 * The harness asks for the numbers with a tui-timing-ask event on the
 * document; they are put in a data-tui-timing attribute for it to read.
 */
(() => {
    if (window.__tuiTiming) return;
    const now = performance.now.bind(performance);
    let top = true;
    try { top = window.top === window; } catch (e) { top = false; }
    const t = window.__tuiTiming = {
        url: location.href, top, loadStart: now(), loadEnd: null,
        keys: [], busy: { listener: 0, observer: 0, timer: 0, frame: 0, chrome: 0 },
        calls: 0, longest: { ms: 0, what: '' }
    };
    const setTimeoutOrig = window.setTimeout;
    const rafOrig = window.requestAnimationFrame;

    // Nested calls (a listener that runs a timer callback by hand) count once.
    let depth = 0;
    const timed = (kind, what, fn) => function (...args) {
        if (depth) return fn.apply(this, args);
        depth++;
        const start = now();
        try {
            return fn.apply(this, args);
        } finally {
            depth--;
            const ms = now() - start;
            t.busy[kind] += ms;
            t.calls++;
            if (ms > t.longest.ms) t.longest = { ms, what };
        }
    };

    // A key press is every keydown listener the event reaches, together.
    const presses = new WeakMap();
    const keyPress = (event, ms) => {
        let entry = presses.get(event);
        if (!entry) {
            entry = { key: event.key, ms: 0, paint: null };
            presses.set(event, entry);
            t.keys.push(entry);
            const at = now();
            // The frame after the key: its animation frame, then a task after the paint.
            rafOrig.call(window, () => setTimeoutOrig.call(window, () => { entry.paint = now() - at + entry.ms; }, 0));
        }
        entry.ms += ms;
    };

    const wrappers = new WeakMap();
    const wrapperOf = (fn, type) => {
        let byType = wrappers.get(fn);
        if (!byType) wrappers.set(fn, byType = new Map());
        if (!byType.has(type)) {
            const run = timed('listener', type, fn);
            byType.set(type, type === 'keydown' ? function (e) {
                const start = now();
                try { return run.call(this, e); } finally { keyPress(e, now() - start); }
            } : run);
        }
        return byType.get(type);
    };
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type, fn, options) {
        return add.call(this, type, typeof fn === 'function' ? wrapperOf(fn, type) : fn, options);
    };
    EventTarget.prototype.removeEventListener = function (type, fn, options) {
        const byType = typeof fn === 'function' && wrappers.get(fn);
        return remove.call(this, type, byType && byType.get(type) || fn, options);
    };

    for (const name of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver']) {
        const Orig = window[name];
        if (!Orig) continue;
        window[name] = class extends Orig {
            constructor(callback, options) { super(timed('observer', name, callback), options); }
        };
    }

    for (const name of ['setTimeout', 'setInterval']) {
        const orig = window[name];
        window[name] = function (fn, ...rest) {
            return orig.call(window, typeof fn === 'function' ? timed('timer', name, fn) : fn, ...rest);
        };
    }
    for (const name of ['requestAnimationFrame', 'requestIdleCallback']) {
        const orig = window[name];
        if (!orig) continue;
        window[name] = function (fn, ...rest) {
            return orig.call(window, timed('frame', name, fn), ...rest);
        };
    }

    // Messages from the background and changes to the settings.
    const events = [chrome.runtime && chrome.runtime.onMessage, chrome.storage && chrome.storage.onChanged];
    for (const event of events) {
        if (!event) continue;
        const orig = event.addListener;
        event.addListener = function (fn) { return orig.call(this, timed('chrome', 'chrome event', fn)); };
    }

    add.call(document, 'tui-timing-ask', () => {
        document.documentElement.setAttribute('data-tui-timing', JSON.stringify(t));
    });
})();
