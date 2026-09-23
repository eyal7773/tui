#!/usr/bin/env node
/**
 * Drives Chromium with the extension from ../src loaded, so a bug can be
 * reproduced and a fix confirmed without reloading anything by hand.
 *
 *   node tui.js <target> [step ...] [--headed] [--debug] [--profile name]
 *                                   [--viewport 1400x900] [--ext dir]
 *
 * <target> is a URL, a saved .mhtml page, or a tui-report-*.zip from the popup
 * (its problem.txt is printed and its page is opened). A saved page is replayed
 * at its original URL from the archive, with the page's own scripts blocked and
 * nothing fetched from the network. Every run starts a fresh browser, so it
 * always tests the current state of src/.
 *
 * Steps run in order:
 *   start:<what>     put the ring on an element, as if the user had got there
 *   key:<Key>[*n]    press a key, n times (ArrowDown, End, Enter, F10, ...)
 *   expect:<what>    fail unless the ring is on that element
 *   click:<what>     a real mouse click
 *   type:<text>      type into whatever has focus
 *   wait:<ms>        pause
 *   shot[:<name>]    screenshot into .work/shots/
 *   goto:<url>       navigate
 *   eval:<js>        run JS in the page and print the result
 *   ring             print where the ring is
 *   login            headed only: waits until you close the window, so you can
 *                    sign in once and keep the session in the profile
 *
 * <what> is text (aria-label, title or visible text; exact match wins over
 * contains) or css=<selector>.
 *
 * --ext loads another build instead of ../src, e.g. an old commit checked out
 * with `git worktree add`, to see whether a bug was already there.
 *
 * Exit code is 1 when an expect fails, so runs can be scripted.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { unpack } = require('./mhtml');

let EXT = path.resolve(__dirname, '../src');
const WORK = path.join(__dirname, '.work');

function parseArgs(argv) {
    const opts = { headed: false, debug: false, profile: 'default', viewport: '1400x900', steps: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--headed') opts.headed = true;
        else if (a === '--debug') opts.debug = true;
        else if (a === '--profile') opts.profile = argv[++i];
        else if (a === '--viewport') opts.viewport = argv[++i];
        else if (a === '--ext') EXT = path.resolve(argv[++i]);
        else if (!opts.target) opts.target = a;
        else opts.steps.push(a);
    }
    return opts;
}

/** Unpacks a popup report and returns the page inside it. */
async function openReport(zip) {
    const dir = path.join(WORK, 'reports', path.basename(zip, '.zip'));
    fs.mkdirSync(dir, { recursive: true });
    // The popup builds these with the JSZip it ships, so read them with it too.
    const JSZip = require(path.join(EXT, 'lib/jszip.min.js'));
    const archive = await JSZip.loadAsync(fs.readFileSync(zip));
    for (const entry of Object.values(archive.files)) {
        if (!entry.dir) fs.writeFileSync(path.join(dir, path.basename(entry.name)), await entry.async('nodebuffer'));
    }
    const problem = path.join(dir, 'problem.txt');
    if (fs.existsSync(problem)) console.log(`problem.txt: ${fs.readFileSync(problem, 'utf8').trim()}\n`);
    const mhtml = fs.readdirSync(dir).find((f) => f.endsWith('.mhtml'));
    if (!mhtml) throw new Error(`No .mhtml in ${zip}`);
    return path.join(dir, mhtml);
}

/** Resolves the target to a URL, and to the archive to serve it from if it is a saved page. */
async function resolveTarget(target) {
    if (/^(https?|file|data|about):/i.test(target)) return { url: target };
    let file = path.resolve(target);
    if (file.endsWith('.zip')) file = await openReport(file);
    if (!fs.existsSync(file)) throw new Error(`Not found: ${file}`);
    if (!/\.mht(ml)?$/i.test(file)) return { url: pathToFileURL(file).href };
    const archive = unpack(file);
    return { url: archive.url, archive };
}

/** Answers every request from the archive; nothing reaches the network. */
async function replay(ctx, archive) {
    const missing = [];
    await ctx.route('**/*', (route) => {
        const url = route.request().url();
        if (!/^https?:/.test(url)) return route.continue();
        const part = archive.parts.get(url.split('#')[0]);
        if (!part) {
            missing.push(url);
            return route.fulfill({ status: 404, body: '' });
        }
        const headers = { 'content-type': part.type };
        // The capture's scripts would run against a page they never expected.
        // The extension's content scripts are not bound by the page's CSP.
        if (part.type === 'text/html') headers['content-security-policy'] = "script-src 'none'";
        return route.fulfill({ status: 200, headers, body: part.body });
    });
    return missing;
}

// ---- Runs inside the page -------------------------------------------------

/** Describes the element the ring is drawn around. */
function pageRing() {
    const spot = document.getElementById('tui-spotlight');
    const describe = (el) => {
        if (!el || el === document.body) return null;
        const text = (el.getAttribute('aria-label') || el.innerText || el.value || el.title || '')
            .replace(/\s+/g, ' ').trim().slice(0, 60);
        const id = el.id ? `#${el.id}` : '';
        const role = el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : '';
        const r = el.getBoundingClientRect();
        return { el: `${el.tagName.toLowerCase()}${id}${role}`, text,
            rect: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}` };
    };
    const shown = spot && getComputedStyle(spot).display !== 'none';
    let ringed = null;
    if (shown) {
        // The ring is positioned in page coordinates; find what it surrounds.
        const s = spot.getBoundingClientRect();
        const same = (el) => {
            const r = el.getBoundingClientRect();
            return Math.abs(r.left - s.left) < 2 && Math.abs(r.top - s.top) < 2 &&
                Math.abs(r.width - s.width) < 2 && Math.abs(r.height - s.height) < 2;
        };
        const active = document.activeElement;
        if (active && same(active)) ringed = active;
        else {
            const hits = document.elementsFromPoint(s.left + s.width / 2, s.top + s.height / 2);
            ringed = hits.find((el) => el !== spot && same(el)) || null;
        }
    }
    return { ring: shown ? (describe(ringed) || { el: '(unmatched)', text: '' }) : null,
        focus: describe(document.activeElement) };
}

/**
 * Finds an element by css=... or by its text and marks it data-tui-harness.
 * With focus set, walks the matches until one really takes focus, since a
 * label is often shared by a live control and a hidden or inert copy.
 */
function pageFind({ what, focus }) {
    let list = [];
    if (what.startsWith('css=')) {
        list = [...document.querySelectorAll(what.slice(4))];
    } else {
        const want = what.trim().toLowerCase();
        const visible = (e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
        };
        const label = (e) => (e.getAttribute('aria-label') || e.getAttribute('title') ||
            e.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const all = [...document.querySelectorAll('body *')].filter((e) => e.id !== 'tui-spotlight' && visible(e));
        const host = (e) => e.closest('a[href],button,input,select,textarea,[tabindex],[role=button],[role=link],[role=treeitem],[role=menuitem],[role=option],[contenteditable=true]');
        const area = (e) => e.getBoundingClientRect().width * e.getBoundingClientRect().height;
        const rank = (matches) => matches
            .sort((x, y) => (!!host(y) - !!host(x)) || area(x) - area(y))
            .map((e) => host(e) || e);
        list = [...rank(all.filter((e) => label(e) === want)),
            ...rank(all.filter((e) => label(e) !== want && label(e).includes(want)))];
        list = list.filter((e, i) => list.indexOf(e) === i);
    }
    let el = list[0];
    if (focus) {
        el = list.find((e) => {
            e.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            e.focus();
            return document.activeElement === e;
        }) || null;
    }
    document.querySelectorAll('[data-tui-harness]').forEach((e) => e.removeAttribute('data-tui-harness'));
    if (!el) return null;
    el.setAttribute('data-tui-harness', '1');
    return true;
}

// ---- Steps ----------------------------------------------------------------

const fmt = (d) => d ? `${d.el} "${d.text}" @${d.rect || ''}` : '(none)';

async function ring(page) {
    const r = await page.evaluate(pageRing);
    return r;
}

async function find(page, what, focus = false) {
    const ok = await page.evaluate(pageFind, { what, focus });
    if (!ok) throw new Error(`No element matches "${what}"${focus ? ' that can take focus' : ''}`);
    return page.locator('[data-tui-harness]').first();
}

async function runStep(page, step, state) {
    const i = step.indexOf(':');
    const cmd = i < 0 ? step : step.slice(0, i);
    const arg = i < 0 ? '' : step.slice(i + 1);

    switch (cmd) {
        case 'start': {
            // The engine picks up focus it sees after a pointer interaction.
            await find(page, arg, true);
            await page.waitForTimeout(200);
            // A throwaway arrow would move the ring, so show it without one.
            const r = await ring(page);
            console.log(`  start  focus → ${fmt(r.focus)}`);
            break;
        }
        case 'key': {
            const [key, times] = arg.split('*');
            for (let n = 0; n < (Number(times) || 1); n++) {
                await page.keyboard.press(key);
                await page.waitForTimeout(state.settle);
            }
            const r = await ring(page);
            console.log(`  ${key}${times ? '*' + times : ''}  ring → ${fmt(r.ring)}${r.ring && r.focus && r.focus.el !== r.ring.el ? `   (focus: ${fmt(r.focus)})` : ''}`);
            break;
        }
        case 'expect': {
            await find(page, arg);
            const hit = await page.evaluate(() => {
                const want = document.querySelector('[data-tui-harness]');
                const spot = document.getElementById('tui-spotlight');
                if (!spot || getComputedStyle(spot).display === 'none') return false;
                const s = spot.getBoundingClientRect();
                const w = want.getBoundingClientRect();
                const inside = s.left - 2 <= w.left && s.top - 2 <= w.top &&
                    s.right + 2 >= w.right && s.bottom + 2 >= w.bottom;
                const around = w.left - 2 <= s.left && w.top - 2 <= s.top &&
                    w.right + 2 >= s.right && w.bottom + 2 >= s.bottom;
                return inside && around || document.activeElement === want ||
                    want.contains(document.activeElement) && inside;
            });
            const r = await ring(page);
            if (hit) console.log(`  PASS   ring is on "${arg}"`);
            else { console.log(`  FAIL   expected "${arg}", ring is on ${fmt(r.ring)}`); state.failed++; }
            break;
        }
        case 'click': (await find(page, arg)).click(); await page.waitForTimeout(500); break;
        case 'type': await page.keyboard.type(arg); break;
        case 'wait': await page.waitForTimeout(Number(arg) || 500); break;
        case 'goto': await page.goto(arg, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500); break;
        case 'eval': console.log('  eval  ', await page.evaluate(arg)); break;
        case 'ring': { const r = await ring(page); console.log(`  ring → ${fmt(r.ring)}  focus → ${fmt(r.focus)}`); break; }
        case 'shot': {
            const dir = path.join(WORK, 'shots');
            fs.mkdirSync(dir, { recursive: true });
            const file = path.join(dir, `${arg || 'shot-' + (++state.shots)}.png`);
            await page.screenshot({ path: file });
            console.log(`  shot   ${file}`);
            break;
        }
        case 'login': {
            if (!state.headed) throw new Error('login needs --headed');
            console.log('  Sign in, then close the browser window to continue.');
            await page.waitForEvent('close', { timeout: 0 });
            break;
        }
        default: throw new Error(`Unknown step "${step}"`);
    }
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (!opts.target) {
        console.log(fs.readFileSync(__filename, 'utf8').match(/\/\*\*([\s\S]*?)\*\//)[1].replace(/^ \* ?/gm, ''));
        process.exit(2);
    }
    const { url, archive } = await resolveTarget(opts.target);
    const [w, h] = opts.viewport.split('x').map(Number);

    const ctx = await chromium.launchPersistentContext(path.join(WORK, 'profiles', opts.profile), {
        channel: 'chromium',
        headless: !opts.headed,
        viewport: { width: w, height: h },
        args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    });
    const missing = archive ? await replay(ctx, archive) : [];
    const state = { failed: 0, shots: 0, settle: 250, headed: opts.headed };
    try {
        let [sw] = ctx.serviceWorkers();
        if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 });
        const version = await sw.evaluate(() => chrome.runtime.getManifest().version);
        // Debug mode is what the popup's admin switch sets; it makes the engine log each move.
        await sw.evaluate((on) => chrome.storage.session.set({ tuiAdminMode: on }), opts.debug);
        console.log(`TUI Navigator ${version} from ${EXT}\nopen ${url}` +
            (archive ? ` (replayed from ${archive.parts.size} saved parts)` : ''));

        const page = ctx.pages()[0] || await ctx.newPage();
        const logFile = path.join(WORK, 'last-console.log');
        const log = fs.createWriteStream(logFile);
        page.on('console', (m) => {
            const t = m.text();
            log.write(`[${m.type()}] ${t}\n`);
            if (opts.debug && t.includes('[TUI')) console.log(`    · ${t.slice(0, 200)}`);
        });
        page.on('pageerror', (e) => log.write(`[pageerror] ${e.message}\n`));

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(1500);

        for (const step of opts.steps) await runStep(page, step, state);

        log.end();
        if (missing.length) console.log(`\n${missing.length} request(s) not in the archive were answered 404`);
        console.log(`\nconsole log: ${logFile}`);
        if (opts.headed && !opts.steps.includes('login')) {
            console.log('Browser left open; close it to finish.');
            await page.waitForEvent('close', { timeout: 0 }).catch(() => {});
        }
    } finally {
        await ctx.close().catch(() => {});
    }
    if (state.failed) { console.log(`\n${state.failed} expectation(s) failed`); process.exit(1); }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
