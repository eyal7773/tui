#!/usr/bin/env node
/**
 * Drives Chromium with the extension from ../src loaded, so a bug can be
 * reproduced and a fix confirmed without reloading anything by hand.
 *
 *   node tui.js <target> [step ...] [--headed] [--debug] [--profile name]
 *                                   [--viewport 1400x900] [--ext dir]
 *
 * <target> is a URL, a saved .mhtml page, or a tui-report-*.zip from F10 > Report a problem
 * (its problem.txt is printed and its page is opened). A saved page is replayed
 * at its original URL from the archive, with the page's own scripts blocked and
 * nothing fetched from the network. Every run starts a fresh browser, so it
 * always tests the current state of src/.
 *
 * Steps run in order:
 *   start:<what>     put the ring on an element, as if the user had got there
 *   key:<Key>[*n]    press a key, n times (ArrowDown, End, Enter, F10, ...)
 *   expect:<what>    fail unless the ring is on that element
 *   expect-not:<what> fail if it is; for pages whose right answer changes
 *   expect-ring:<what> fail unless the ring is drawn around it, focus or not
 *   click:<what>     a real mouse click
 *   type:<text>      type into whatever has focus
 *   wait:<ms>        pause
 *   shot[:<name>]    screenshot into .work/shots/
 *   goto:<url>       navigate
 *   eval:<js>        run JS in the page and print the result
 *   ring             print where the ring is
  report           after F10 > Report a problem: read the log the report window shows
  report-has:<re>  fail unless that log matches the regular expression
  report-lacks:<re> fail if it does
  report-send:<text> after report: write <text> as the description, untick the
                   copy of the page (Chrome's question cannot be answered here)
                   and press Send on GitHub; the issue it opens (its title, then
                   its body) becomes what report-has and report-lacks check
  report-key:<key> press a key in the report window
  report-eval:<js> run JS in the report window; fails if it throws
  report-shot[:<name>] screenshot the report window into .work/shots/
 *   login            headed only: waits until you close the window, so you can
 *                    sign in once and keep the session in the profile
 *
 * <what> is text (aria-label, title or visible text; exact match wins over
 * contains) or css=<selector>.
 *
 * --as-chrome hides that the browser is automated (no "HeadlessChrome" in the
 * user agent, no navigator.webdriver), so sites that answer a bot with a
 * check show their real page. survey.js uses it; scenarios keep what they
 * were recorded with.
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
        else if (a === '--as-chrome') opts.asChrome = true;
        else if (a === '--debug') opts.debug = true;
        else if (a === '--profile') opts.profile = argv[++i];
        else if (a === '--viewport') opts.viewport = argv[++i];
        else if (a === '--ext') EXT = path.resolve(argv[++i]);
        else if (!opts.target) opts.target = a;
        else opts.steps.push(a);
    }
    return opts;
}

/** Unpacks a report (F10 > Report a problem) and returns the page inside it. */
async function openReport(zip) {
    const dir = path.join(WORK, 'reports', path.basename(zip, '.zip'));
    // Emptied first: a second zip of the same name (r.zip) found the first
    // one's page still there and replayed that.
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    // The report window builds these with the JSZip it ships, so read them with it too.
    const JSZip = require(path.join(EXT, 'lib/jszip.min.js'));
    const archive = await JSZip.loadAsync(fs.readFileSync(zip));
    for (const entry of Object.values(archive.files)) {
        if (!entry.dir) fs.writeFileSync(path.join(dir, path.basename(entry.name)), await entry.async('nodebuffer'));
    }
    const problem = path.join(dir, 'problem.txt');
    if (fs.existsSync(problem)) console.log(`problem.txt: ${fs.readFileSync(problem, 'utf8').trim()}\n`);
    const mhtml = fs.readdirSync(dir).find((f) => f.endsWith('.mhtml'));
    // The copy of the page is optional; without it there is nothing to replay.
    if (!mhtml) throw new Error(`No copy of the page in ${zip}: its log is in ${dir}`);
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
    // The focused element inside any shadow roots, not the outer host.
    let deep = document.activeElement;
    while (deep && deep.shadowRoot && deep.shadowRoot.activeElement) deep = deep.shadowRoot.activeElement;
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
        // An inline link is ringed around the block it wraps (see rectOf).
        const holds = (el) => { const r = el.getBoundingClientRect();
            return s.left - 2 <= r.left && s.top - 2 <= r.top && s.right + 2 >= r.right && s.bottom + 2 >= r.bottom; };
        if (deep && (same(deep) || holds(deep))) ringed = deep;
        else {
            const hits = document.elementsFromPoint(s.left + s.width / 2, s.top + s.height / 2);
            ringed = hits.find((el) => el !== spot && same(el)) || null;
        }
    }
    return { ring: shown ? (describe(ringed) || { el: '(unmatched)', text: '' }) : null,
        focus: describe(deep) };
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

/**
 * The frame the keys go to: down through every focused <iframe>. Once the
 * ring steps into a frame, that frame's engine draws it, so ring and expect
 * look there.
 */
async function keyFrame(page) {
    let frame = page.mainFrame();
    for (let depth = 0; depth < 5; depth++) {
        const handle = await frame.evaluateHandle(() => document.activeElement);
        const el = handle.asElement();
        const inner = el && /^i?frame$/i.test(await el.evaluate((e) => e.tagName)) ? await el.contentFrame() : null;
        await handle.dispose();
        if (!inner) break;
        frame = inner;
    }
    return frame;
}

async function ring(page) {
    const frame = await keyFrame(page);
    const r = await frame.evaluate(pageRing);
    if (frame !== page.mainFrame()) {
        if (r.ring) r.ring.el = `frame> ${r.ring.el}`;
        if (r.focus) r.focus.el = `frame> ${r.focus.el}`;
    }
    return r;
}

async function find(page, what, focus = false, frame = page.mainFrame()) {
    const ok = await frame.evaluate(pageFind, { what, focus });
    if (!ok) throw new Error(`No element matches "${what}"${focus ? ' that can take focus' : ''}`);
    return frame.locator('[data-tui-harness]').first();
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
        case 'expect':
        case 'expect-not':
        case 'expect-ring': {
            const want = cmd !== 'expect-not';
            const frame = await keyFrame(page);
            await find(page, arg, false, frame);
            const hit = await frame.evaluate((drawnOnly) => {
                const want = document.querySelector('[data-tui-harness]');
                const spot = document.getElementById('tui-spotlight');
                if (!spot || getComputedStyle(spot).display === 'none') return false;
                const s = spot.getBoundingClientRect();
                const w = want.getBoundingClientRect();
                const inside = s.left - 2 <= w.left && s.top - 2 <= w.top &&
                    s.right + 2 >= w.right && s.bottom + 2 >= w.bottom;
                const around = w.left - 2 <= s.left && w.top - 2 <= s.top &&
                    w.right + 2 >= s.right && w.bottom + 2 >= s.bottom;
                if (drawnOnly) return inside && around;
                return inside && around || document.activeElement === want ||
                    want.contains(document.activeElement) && inside;
            }, cmd === 'expect-ring');
            const r = await ring(page);
            if (hit === want) console.log(`  PASS   ring is ${want ? '' : 'not '}on "${arg}"`);
            else { console.log(`  FAIL   expected ${want ? '' : 'anything but '}"${arg}", ring is on ${fmt(r.ring)}`); state.failed++; }
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
        case 'report': {
            // F10 > Report a problem opens a window; this reads the log it shows.
            // A new window is about:blank when it first appears, so look again until it has loaded.
            let win = null;
            for (let tries = 0; !win && tries < 25; tries++) {
                win = state.ctx.pages().find((p) => p.url().includes('/report/report.html'));
                if (!win) await new Promise((r) => setTimeout(r, 200));
            }
            if (!win) throw new Error(`The report window did not open; pages: ${state.ctx.pages().map((p) => p.url()).join(', ')}`);
            // Asking again brings the open window forward rather than opening another.
            await new Promise((r) => setTimeout(r, 500));
            const open = state.ctx.pages().filter((p) => p.url().includes('/report/report.html')).length;
            if (open > 1) { console.log(`  FAIL   ${open} report windows are open`); state.failed++; }
            await win.waitForFunction(() => !/^Reading/.test(document.getElementById('log').textContent), null, { timeout: 5000 });
            state.reportWin = win;
            state.report = await win.evaluate(() => document.getElementById('log').textContent);
            const file = path.join(WORK, 'last-report-log.txt');
            fs.writeFileSync(file, state.report);
            console.log(`  report ${state.report.split('\n').length} lines, saved to ${file}`);
            break;
        }
        case 'report-send': {
            // The link is the one the window opened; GitHub itself answers (a sign-in page, signed out).
            const win = state.reportWin;
            if (!win) throw new Error('report-send needs a report step before it');
            await win.fill('#description', arg);
            await win.uncheck('#include-page');
            const [issue] = await Promise.all([
                state.ctx.waitForEvent('page', { timeout: 10000 }),
                win.click('#send')
            ]);
            const url = new URL(await win.evaluate(() => issueLink));
            state.report = `title: ${url.searchParams.get('title')}

${url.searchParams.get('body')}`;
            fs.writeFileSync(path.join(WORK, 'last-report-issue.txt'), `${url.href}

${state.report}`);
            console.log(`  issue  ${url.origin}${url.pathname}, link ${url.href.length} long`);
            console.log(`         title: ${url.searchParams.get('title')}`);
            await issue.waitForLoadState('domcontentloaded').catch(() => {});
            console.log(`         landed on ${issue.url().slice(0, 300)}`);
            await issue.close();
            break;
        }
        case 'report-key':
            if (!state.reportWin) throw new Error('report-key needs a report step before it');
            await state.reportWin.keyboard.press(arg);
            break;
        case 'report-eval':
            if (!state.reportWin) throw new Error('report-eval needs a report step before it');
            console.log('  eval  ', await state.reportWin.evaluate(arg));
            break;
        case 'report-shot': {
            if (!state.reportWin) throw new Error('report-shot needs a report step before it');
            const dir = path.join(WORK, 'shots');
            fs.mkdirSync(dir, { recursive: true });
            const file = path.join(dir, `${arg || 'report-' + (++state.shots)}.png`);
            await state.reportWin.screenshot({ path: file, fullPage: true });
            console.log(`  shot   ${file}`);
            break;
        }
        case 'report-has':
        case 'report-lacks': {
            if (state.report === undefined) throw new Error(`${cmd} needs a report step before it`);
            const has = new RegExp(arg, 'm').test(state.report);   // ^ and $ are per line
            if (has === (cmd === 'report-has')) console.log(`  PASS   report ${cmd === 'report-has' ? 'has' : 'lacks'} /${arg}/`);
            else { console.log(`  FAIL   report ${cmd === 'report-has' ? 'lacks' : 'has'} /${arg}/`); state.failed++; }
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

    const profile = path.join(WORK, 'profiles', opts.profile);
    // Chrome keeps the extension's service worker from the last run in the
    // profile and starts that one, so a change to background.js went untested.
    // Only the cached worker goes; sign-ins and cookies stay.
    fs.rmSync(path.join(profile, 'Default', 'Service Worker'), { recursive: true, force: true });
    const ctx = await chromium.launchPersistentContext(profile, {
        channel: 'chromium',
        headless: !opts.headed,
        viewport: { width: w, height: h },
        args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
            // Sites turn away navigator.webdriver with a bot check before the page is seen.
            ...(opts.asChrome ? ['--disable-blink-features=AutomationControlled'] : [])],
    });
    const missing = archive ? await replay(ctx, archive) : [];
    const state = { failed: 0, shots: 0, settle: 250, headed: opts.headed, ctx: ctx };
    try {
        let [sw] = ctx.serviceWorkers();
        if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 });
        const version = await sw.evaluate(() => chrome.runtime.getManifest().version);
        // Admin mode is what the popup's switch sets; it makes the log verbose and prints it.
        await sw.evaluate((on) => chrome.storage.session.set({ tuiAdminMode: on }), opts.debug);
        console.log(`TUI Navigator ${version} from ${EXT}\nopen ${url}` +
            (archive ? ` (replayed from ${archive.parts.size} saved parts)` : ''));

        const page = ctx.pages()[0] || await ctx.newPage();
        if (opts.asChrome && !opts.headed) {
            // "HeadlessChrome" in the user agent gets a bot check instead of the page.
            const cdp = await ctx.newCDPSession(page);
            const ua = await page.evaluate(() => navigator.userAgent);
            await cdp.send('Emulation.setUserAgentOverride', { userAgent: ua.replace('HeadlessChrome', 'Chrome') });
        }
        // One per profile, so runs in parallel (survey.js) keep their own.
        const logFile = path.join(WORK, opts.profile === 'default' ? 'last-console.log' : `last-console-${opts.profile}.log`);
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
