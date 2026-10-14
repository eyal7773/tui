/**
 * Where the extension spends its time, for tui.js's profile step.
 *
 * Chrome's own CPU profiler (through the DevTools protocol) samples the
 * page's main thread while keys are pressed. Content scripts run on that
 * thread, in their own world, and their functions carry the extension's
 * chrome-extension:// address, so they can be told apart from the page's.
 * The extension in src/ runs as it is: nothing is added to it.
 *
 * Two lists are printed:
 *
 *   by total  the extension's functions, by the time spent in them and in
 *             everything they called: where to look first
 *   by self   whatever was running itself while an extension function was
 *             on the stack: a function's own code, or a browser call it made.
 *             Layout forced by getBoundingClientRect or getComputedStyle is
 *             counted to that call, so it shows here by name
 *
 * The whole profile is saved too, to be opened in DevTools (Performance,
 * Load profile) for the full call tree.
 */
const path = require('path');

const isExtension = (url) => /^chrome-extension:/.test(url || '');

/** "name file:line" for a profile node's function. */
function nameOf(frame) {
    const file = frame.url ? path.basename(frame.url.split('?')[0]) : '';
    const name = frame.functionName || (file ? '(anonymous)' : '(native)');
    return file ? `${name} ${file}:${frame.lineNumber + 1}` : name;
}

/** Starts the profiler on page; returns a function that stops it and gives back the profile. */
async function startProfile(page) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    // 100µs: a key press of a few ms still gets enough samples to read.
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
    await cdp.send('Profiler.start');
    return async () => {
        const { profile } = await cdp.send('Profiler.stop');
        await cdp.detach().catch(() => {});
        return profile;
    };
}

/** What the extension did in a profile: its time in all, and the two lists. */
function analyse(profile, top = 15) {
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const parent = new Map();
    for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);

    const total = new Map();   // extension function -> ms, the stack under it included
    const self = new Map();    // whatever ran, under an extension function -> ms
    let inExtension = 0;
    let sampled = 0;
    profile.samples.forEach((id, i) => {
        // A sample's time is the gap after it: the next sample's delta.
        const ms = (profile.timeDeltas[i + 1] || 0) / 1000;
        sampled += ms;
        const seen = new Set();
        let ours = false;
        for (let node = id; node !== undefined; node = parent.get(node)) {
            const frame = byId.get(node).callFrame;
            if (!isExtension(frame.url)) continue;
            ours = true;
            const key = nameOf(frame);
            if (seen.has(key)) continue;   // a recursive call counts once
            seen.add(key);
            total.set(key, (total.get(key) || 0) + ms);
        }
        if (!ours) return;
        inExtension += ms;
        const key = nameOf(byId.get(id).callFrame);
        self.set(key, (self.get(key) || 0) + ms);
    });

    const list = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, top)
        .map(([name, ms]) => ({ name, ms: Math.round(ms * 10) / 10 }));
    return { sampled: Math.round(sampled), inExtension: Math.round(inExtension * 10) / 10,
        byTotal: list(total), bySelf: list(self) };
}

/** The analysis as lines to print. */
function describe(result, presses) {
    const per = presses ? ` (${Math.round(result.inExtension / presses * 10) / 10}ms a press)` : '';
    const lines = [`extension ${result.inExtension}ms of ${result.sampled}ms sampled${per}`, 'by total:'];
    for (const r of result.byTotal) lines.push(`  ${String(r.ms).padStart(8)}ms  ${r.name}`);
    lines.push('by self:');
    for (const r of result.bySelf) lines.push(`  ${String(r.ms).padStart(8)}ms  ${r.name}`);
    return lines;
}

module.exports = { startProfile, analyse, describe };
