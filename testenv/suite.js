#!/usr/bin/env node
/**
 * Runs every scenario in scenarios/ (or the ones named) and prints a summary.
 *
 *   node suite.js [scenario.tui ...] [--ext dir]
 *
 * A .tui file is the arguments of one tui.js run, one per line: the target
 * first, then the steps. Lines starting with # are comments, and a relative
 * target is read from the scenario's own folder. Each fixed bug report is
 * worth keeping as one, so a later change cannot quietly bring it back.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const extra = [];
const ext = args.indexOf('--ext');
if (ext >= 0) extra.push('--ext', path.resolve(args.splice(ext, 2)[1]));

const dir = path.join(__dirname, 'scenarios');
const files = args.length ? args.map((f) => path.resolve(f))
    : fs.readdirSync(dir).filter((f) => f.endsWith('.tui')).map((f) => path.join(dir, f));

const results = [];
for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
    let [target, ...steps] = lines;
    if (!/^[a-z]+:/i.test(target)) target = path.resolve(path.dirname(file), target);
    const name = path.basename(file, '.tui');
    if (!/^[a-z]+:/i.test(target) && !fs.existsSync(target)) {
        console.log(`\n=== ${name}: SKIP, ${target} is not on this machine`);
        results.push([name, 'SKIP']);
        continue;
    }
    console.log(`\n=== ${name}`);
    const run = spawnSync(process.execPath, [path.join(__dirname, 'tui.js'), target, ...steps, ...extra],
        { stdio: 'inherit' });
    results.push([name, run.status === 0 ? 'PASS' : 'FAIL']);
}

console.log('\n' + results.map(([n, r]) => `${r.padEnd(5)} ${n}`).join('\n'));
process.exit(results.some(([, r]) => r === 'FAIL') ? 1 : 0);
