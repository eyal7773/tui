#!/usr/bin/env node
/**
 * Walks a live site with a fixed set of keys and flags what looks wrong.
 *
 *   node survey.js <url> [--ext dir] [--profile name] [--name label]
 *
 * It runs tui.js with ArrowDown, ArrowRight, ArrowLeft and ArrowUp presses,
 * reads the page position after each one, and prints the trace followed by
 * the suspect steps:
 *
 *   none       no ring after a key
 *   unmatched  a ring that is around no element
 *   stuck      the ring did not move and the page did not scroll
 *   backwards  the ring went the opposite way to the key
 *   offscreen  the ring is outside the window
 *   huge       the ring takes in most of the window
 *   error      the extension threw (from the console log)
 *
 * A flag is a lead, not a verdict: read the trace and the screenshot
 * (.work/shots/<name>-end.png) before calling it a bug.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const url = args.find((a) => /^https?:/.test(a));
if (!url) { console.log(fs.readFileSync(__filename, 'utf8').match(/\/\*\*([\s\S]*?)\*\//)[1].replace(/^ \* ?/gm, '')); process.exit(2); }
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const name = opt('--name') || new URL(url).hostname.replace(/^www\./, '');
const profile = opt('--profile') || 'survey';
const saveTo = path.join(__dirname, '.work', 'survey');
const ext = opt('--ext');

const W = 1400, H = 900;
const KEYS = [...Array(8).fill('ArrowDown'), 'ArrowRight', 'ArrowRight', 'ArrowRight',
    'ArrowLeft', 'ArrowLeft', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp', 'ArrowUp'];
const steps = ['wait:3000', 'shot:' + name + '-start'];
for (const k of KEYS) steps.push('key:' + k, 'eval:scrollX+","+scrollY');
steps.push('shot:' + name + '-end');

const run = spawnSync(process.execPath, [path.join(__dirname, 'tui.js'), url, ...steps,
    '--profile', profile, '--as-chrome', ...(ext ? ['--ext', ext] : [])], { encoding: 'utf8', timeout: 180000 });
const out = (run.stdout || '') + (run.stderr || '');
const lines = out.split('\n');

// Pair each key line with the scroll position printed after it.
const trace = [];
for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s+(Arrow\w+)\s+ring → (.*)$/);
    if (!m) continue;
    const s = (lines[i + 1] || '').match(/eval\s+(-?\d+),(-?\d+)/);
    const r = m[2].match(/@(-?\d+),(-?\d+) (\d+)x(\d+)/);
    trace.push({ key: m[1], ring: m[2], sx: s ? +s[1] : 0, sy: s ? +s[2] : 0,
        x: r ? +r[1] : null, y: r ? +r[2] : null, w: r ? +r[3] : null, h: r ? +r[4] : null });
}

const flags = [];
let prev = null;
trace.forEach((t, i) => {
    const at = `#${i + 1} ${t.key}`;
    if (t.ring === '(none)') flags.push(`${at} none`);
    else if (t.ring.startsWith('(unmatched)')) flags.push(`${at} unmatched`);
    if (t.x !== null) {
        if (t.y + t.h < 0 || t.y > H || t.x + t.w < 0 || t.x > W) flags.push(`${at} offscreen ${t.ring}`);
        if (t.w * t.h > W * H * 0.5) flags.push(`${at} huge ${t.ring}`);
    }
    if (prev && prev.x !== null && t.x !== null) {
        const same = prev.ring === t.ring && prev.sx === t.sx && prev.sy === t.sy;
        if (same) flags.push(`${at} stuck ${t.ring}`);
        // Centres in page coordinates, so a scroll does not count as a move.
        const dx = (t.x + t.w / 2 + t.sx) - (prev.x + prev.w / 2 + prev.sx);
        const dy = (t.y + t.h / 2 + t.sy) - (prev.y + prev.h / 2 + prev.sy);
        const back = { ArrowDown: dy < -5, ArrowUp: dy > 5, ArrowRight: dx < -5, ArrowLeft: dx > 5 }[t.key];
        if (back && prev.ring !== t.ring) flags.push(`${at} backwards (${Math.round(dx)},${Math.round(dy)}) ${prev.ring} ⇒ ${t.ring}`);
    }
    prev = t;
});

const consoleLog = path.join(__dirname, '.work', `last-console-${profile}.log`);
if (fs.existsSync(consoleLog)) {
    for (const l of fs.readFileSync(consoleLog, 'utf8').split('\n')) {
        if (/chrome-extension:|\[TUI\].*error|engine\.js|TuiLog/i.test(l) && /error|exception|uncaught/i.test(l)) flags.push('error ' + l.slice(0, 200));
    }
}

const report = [];
const say = (l) => report.push(l);
say(`== ${name}  ${url}`);
if (!trace.length) say(out.split('\n').slice(-8).join('\n'));
trace.forEach((t, i) => say(`${String(i + 1).padStart(2)} ${t.key.padEnd(10)} ${t.ring}  [scroll ${t.sx},${t.sy}]`));
say(flags.length ? 'FLAGS:\n  ' + flags.join('\n  ') : 'FLAGS: none');
say(`shots: .work/shots/${name}-start.png, .work/shots/${name}-end.png`);
fs.mkdirSync(saveTo, { recursive: true });
fs.writeFileSync(path.join(saveTo, name + '.txt'), report.join('\n') + '\n');
console.log(report.join('\n'));
