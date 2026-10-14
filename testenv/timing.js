/**
 * How long the extension takes, for tui.js's timing step and perf.js.
 *
 * The extension in src/ is not changed. A copy of it is made under
 * .work/timed-ext/, with timing/timing-start.js loaded before its content
 * scripts and timing/timing-end.js after them; see timing-start.js for what
 * is measured and what is not.
 */
const fs = require('fs');
const path = require('path');

/** Copies the extension in ext to dir with the timing scripts added, and returns dir. */
function timedBuild(ext, dir) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.cpSync(ext, dir, { recursive: true });
    for (const f of ['timing-start.js', 'timing-end.js']) {
        fs.copyFileSync(path.join(__dirname, 'timing', f), path.join(dir, f));
    }
    const file = path.join(dir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const cs of manifest.content_scripts || []) {
        cs.js = ['timing-start.js', ...cs.js, 'timing-end.js'];
    }
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
    return dir;
}

/** The numbers of every frame the extension runs in. */
async function readTiming(page) {
    const frames = [];
    for (const frame of page.frames()) {
        const json = await frame.evaluate(() => {
            document.dispatchEvent(new CustomEvent('tui-timing-ask'));
            const v = document.documentElement.getAttribute('data-tui-timing');
            document.documentElement.removeAttribute('data-tui-timing');
            return v;
        }).catch(() => null);   // A frame that went away, or one the extension is not in.
        if (json) frames.push(JSON.parse(json));
    }
    return frames;
}

const round = (ms) => Math.round(ms * 10) / 10;
const sum = (list) => list.reduce((a, b) => a + b, 0);

/** The frames' numbers put together: what perf.js compares with its budget. */
function summarize(frames) {
    const top = frames.find((f) => f.top);
    const subs = frames.filter((f) => !f.top);
    const load = (f) => f.loadEnd === null ? 0 : f.loadEnd - f.loadStart;
    const keys = frames.flatMap((f) => f.keys);
    const busy = (f) => sum(Object.values(f.busy));
    const longest = frames.reduce((a, f) => f.longest.ms > a.ms ? f.longest : a, { ms: 0, what: '' });
    return {
        frames: frames.length,
        loadTop: round(top ? load(top) : 0),
        loadFrames: round(sum(subs.map(load))),
        loadFrameMax: round(Math.max(0, ...subs.map(load))),
        keys: keys.length,
        keyAvg: round(keys.length ? sum(keys.map((k) => k.ms)) / keys.length : 0),
        keyMax: round(Math.max(0, ...keys.map((k) => k.ms))),
        paintMax: round(Math.max(0, ...keys.map((k) => k.paint || 0))),
        busy: round(sum(frames.map(busy))),
        longest: round(longest.ms),
        longestWhat: longest.what
    };
}

/** The summary and each frame, as lines to print. */
function describe(frames) {
    const s = summarize(frames);
    const lines = [
        `load     top page ${s.loadTop}ms, ${s.frames - 1} frame(s) ${s.loadFrames}ms in all (slowest ${s.loadFrameMax}ms)`,
        `keys     ${s.keys} press(es), ${s.keyAvg}ms on average, slowest ${s.keyMax}ms, painted within ${s.paintMax}ms`,
        `busy     ${s.busy}ms in all, longest single run ${s.longest}ms (${s.longestWhat || '-'})`
    ];
    for (const f of frames) {
        const b = Object.entries(f.busy).filter(([, ms]) => ms >= 0.5).map(([k, ms]) => `${k} ${round(ms)}`).join(', ');
        lines.push(`  ${f.top ? 'top  ' : 'frame'} load ${round(f.loadEnd === null ? 0 : f.loadEnd - f.loadStart)}ms` +
            `${f.keys.length ? `, ${f.keys.length} key(s)` : ''}${b ? `, busy: ${b}` : ''}  ${f.url.slice(0, 80)}`);
    }
    return { summary: s, lines };
}

module.exports = { timedBuild, readTiming, summarize, describe };
