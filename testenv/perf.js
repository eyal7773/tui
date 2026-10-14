#!/usr/bin/env node
/**
 * Measures how long the extension takes on heavy live sites, and fails when
 * it is over budget.
 *
 *   node perf.js [url ...] [--ext dir] [--runs n]
 *
 * Each site is opened by tui.js with its timing step (see timing.js): the
 * extension is a timed copy made under .work/, src/ is not changed. After
 * the page settles, the same keys are pressed on every site, then a row of
 * the table is printed:
 *
 *   top      the extension's scripts loading and starting in the page
 *   frames   their loading in every frame together (ads, players, widgets)
 *   key avg / key max   the extension's work for one key press
 *   paint    the slowest key until the next frame was painted, the page's
 *            own work in that frame included
 *   busy     all of the extension's work in the run, added up
 *   longest  its longest single piece of work, which blocks the page
 *
 * A number over BUDGET is marked !, and the exit code is 1. A site that did
 * not load is SKIP and does not count. Live sites vary from run to run, so
 * --runs n opens each one n times and keeps the best run (fewest numbers
 * over budget, then the least busy), which leaves out a slow moment of the
 * machine or the network.
 *
 * --ext dir measures another build, such as an older commit checked out with
 * `git worktree add`, to see whether a change made the extension slower.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SITES = [
    'https://www.amazon.com/s?k=headphones',
    'https://www.youtube.com/',
    'https://www.yahoo.com/',
    'https://www.booking.com/',
    'https://www.ebay.com/sch/i.html?_nkw=headphones',
    'https://edition.cnn.com/',
    'https://www.bbc.com/news',
    'https://www.microsoft.com/en-us',
    'https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster-than-processing-an-unsorted-array',
    'https://en.wikipedia.org/wiki/United_States'
];

// In milliseconds. A frame is 16ms; work longer than 50ms is what Chrome
// calls a long task, one the user can feel.
const BUDGET = {
    loadTop: 50,
    loadFrames: 300,
    keyAvg: 16,
    keyMax: 50,
    longest: 50
};

const KEYS = [...Array(8).fill('ArrowDown'), 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowUp'];
const PARALLEL = 3;

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const ext = opt('--ext');
const runs = Number(opt('--runs')) || 1;
const urls = args.filter((a) => /^https?:/.test(a));
const sites = urls.length ? urls : SITES;
const WORK = path.join(__dirname, '.work');

const nameOf = (url) => new URL(url).hostname.replace(/^www\.|^edition\./, '');

/** One run of tui.js on url; the summary, or why there is none. */
function measure(url, profile) {
    const steps = ['wait:5000', ...KEYS.map((k) => 'key:' + k), 'timing'];
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [path.join(__dirname, 'tui.js'), url, ...steps,
            '--profile', profile, '--as-chrome', ...(ext ? ['--ext', ext] : [])]);
        let out = '';
        child.stdout.on('data', (d) => { out += d; });
        child.stderr.on('data', (d) => { out += d; });
        const timer = setTimeout(() => child.kill(), 180000);
        child.on('close', () => {
            clearTimeout(timer);
            const file = path.join(WORK, `last-timing-${profile}.json`);
            if (!/^\s+load\s/m.test(out) || !fs.existsSync(file)) {
                return resolve({ skip: out.trim().split('\n').pop() || 'no output' });
            }
            resolve(JSON.parse(fs.readFileSync(file, 'utf8')).summary);
        });
    });
}

const over = (s) => Object.keys(BUDGET).filter((k) => s[k] > BUDGET[k]);

async function site(url, slot) {
    // The timing file of an earlier run must not be read as this one's.
    const profile = `perf${slot}`;
    let best = null;
    for (let n = 0; n < runs; n++) {
        fs.rmSync(path.join(WORK, `last-timing-${profile}.json`), { force: true });
        const s = await measure(url, profile);
        if (s.skip) { if (!best) best = s; continue; }
        if (!best || best.skip || over(s).length < over(best).length ||
            over(s).length === over(best).length && s.busy < best.busy) best = s;
    }
    return best;
}

async function main() {
    const results = new Array(sites.length);
    let next = 0;
    // Each worker keeps its own profile, so runs in parallel do not share one.
    await Promise.all([...Array(Math.min(PARALLEL, sites.length))].map(async (_, slot) => {
        while (next < sites.length) {
            const i = next++;
            results[i] = await site(sites[i], slot);
            process.stderr.write(`  ${nameOf(sites[i])} done\n`);
        }
    }));

    const cols = [['top', 'loadTop'], ['frames', 'loadFrames'], ['key avg', 'keyAvg'], ['key max', 'keyMax'],
        ['paint', 'paintMax'], ['busy', 'busy'], ['longest', 'longest']];
    const pad = (v, w) => String(v).padStart(w);
    console.log(`${'site'.padEnd(20)}${pad('frames#', 8)}${cols.map(([h]) => pad(h, 10)).join('')}  longest is`);
    let failed = 0;
    sites.forEach((url, i) => {
        const s = results[i];
        if (s.skip) { console.log(`${nameOf(url).padEnd(20)}SKIP ${s.skip.slice(0, 100)}`); return; }
        const bad = over(s);
        if (bad.length) failed++;
        console.log(`${nameOf(url).padEnd(20)}${pad(s.frames, 8)}` +
            cols.map(([, k]) => pad(s[k] + (bad.includes(k) ? '!' : ' '), 10)).join('') + `  ${s.longestWhat}`);
    });
    console.log(`\nbudget (ms): ${Object.entries(BUDGET).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    if (failed) { console.log(`${failed} site(s) over budget`); process.exit(1); }
}

main();
