#!/usr/bin/env node
/**
 * Runs every scenario in scenarios/ (or the ones named) and prints a summary.
 *
 *   node suite.js [scenario.tui ...] [--ext dir] [--local]
 *
 * A .tui file is the arguments of one tui.js run, one per line: the target
 * first, then the steps. Lines starting with # are comments, and a relative
 * target is read from the scenario's own folder. Each fixed bug report is
 * worth keeping as one, so a later change cannot quietly bring it back.
 *
 * A scenario on a live site is SKIP, not FAIL, when the site did not serve
 * the page it was written for (tui.js exits 3): the page did not load, or a
 * start step's element is gone. --local leaves the live sites out, for a
 * quick run whose result depends on the extension only.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const extra = [];
const ext = args.indexOf('--ext');
if (ext >= 0) extra.push('--ext', path.resolve(args.splice(ext, 2)[1]));
const local = args.indexOf('--local');
const localOnly = local >= 0;
if (localOnly) args.splice(local, 1);
const SITE_CHANGED = 3;

const dir = path.join(__dirname, 'scenarios');
const files = args.length ? args.map((f) => path.resolve(f))
    : fs.readdirSync(dir).filter((f) => f.endsWith('.tui')).map((f) => path.join(dir, f));

const results = [];
for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
    let [target, ...steps] = lines;
    // A URL has a scheme of two letters or more; C: is a Windows drive.
    const isUrl = (t) => /^[a-z][a-z0-9+.-]+:/i.test(t);
    if (!isUrl(target)) target = path.resolve(path.dirname(file), target);
    const name = path.basename(file, '.tui');
    if (localOnly && isUrl(target)) continue;
    if (!isUrl(target) && !fs.existsSync(target)) {
        console.log(`\n=== ${name}: SKIP, ${target} is not on this machine`);
        results.push([name, 'SKIP']);
        continue;
    }
    console.log(`\n=== ${name}`);
    const run = spawnSync(process.execPath, [path.join(__dirname, 'tui.js'), target, ...steps, ...extra],
        { stdio: 'inherit' });
    if (run.status === SITE_CHANGED) results.push([name, 'SKIP', 'the live site served another page']);
    else results.push([name, run.status === 0 ? 'PASS' : 'FAIL']);
}

console.log('\n' + results.map(([n, r, why]) => `${r.padEnd(5)} ${n}${why ? ` (${why})` : ''}`).join('\n'));
process.exit(results.some(([, r]) => r === 'FAIL') ? 1 : 0);
