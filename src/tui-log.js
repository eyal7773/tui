/**
 * What the engine did, kept so a bug report can say why the ring went where
 * it went.
 *
 * Everything to do with the log lives here; the engine only calls in. The rules
 * that keep it safe to record all the time:
 *
 *   - It stays in this page's memory: the last MAX_ENTRIES events, gone on
 *     reload. Nothing is written to storage and nothing is sent anywhere. The
 *     only way out is a report the user asks for from the F10 menu, and they
 *     see every line of it before they save it.
 *   - It records the shape of the page, never its content. An element is its
 *     tag, role, a few class names, tabindex and where it is on screen: no
 *     text, labels, links, ids or data attributes. Keys are only the ones the
 *     engine acts on (arrows, Enter, Home/End, F10, Escape), never a typed
 *     character.
 *   - An event is a small object pushed onto an array. Nothing is formatted
 *     or printed until a report asks for it.
 *
 * Admin mode (ten clicks on the version in the popup) turns on `verbose`: each
 * event is also printed to the console, `detail` events are recorded, and an
 * element also carries its id, label, link and its opening tag. That is for
 * the developer's own pages; callers guard anything costly with
 * `if (TuiLog.verbose)` so that it costs nothing otherwise.
 *
 * Only the top frame records. A frame's own engine reports nothing; the top
 * frame logs the step into it and the step back out.
 */
(function (root) {
  'use strict';

  /**
   * How many events are kept: a step is about three (navigate, candidates,
   * focus), so this is the last six or seven key presses. A few KB at most.
   */
  const MAX_ENTRIES = 20;

  /** Class names kept per element, and how much of each. */
  const MAX_CLASSES = 3;
  const MAX_CLASS_LENGTH = 30;

  /** The keys the engine acts on. Anything else is recorded as "other". */
  const SAFE_KEYS = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Enter', 'Home', 'End', 'F10', 'Escape', 'Tab'
  ]);

  let entries = [];
  let verbose = false;
  let recording = true;

  function safeKey(key) {
    return SAFE_KEYS.has(key) ? key : 'other';
  }

  function attrOf(el, name) {
    return el && typeof el.getAttribute === 'function' ? el.getAttribute(name) : null;
  }

  function classesOf(el) {
    const raw = el && typeof el.className === 'string' ? el.className.trim() : '';
    if (!raw) return '';
    return raw.split(/\s+/).slice(0, MAX_CLASSES)
      .map(c => c.slice(0, MAX_CLASS_LENGTH)).join('.');
  }

  /**
   * An element as the log shows it: TAG.class.class role=x tabindex=n @x,y wxh.
   * rect is optional; pass one the caller already has rather than measuring
   * again. In verbose mode the id, label, href and start of the markup follow.
   */
  function describe(el, rect) {
    // A frame does not record, so it need not measure anything either.
    if (!recording) return '';
    if (!el || !el.tagName) return String(el === null || el === undefined ? 'none' : el);
    let out = el.tagName;
    const cls = classesOf(el);
    if (cls) out += '.' + cls;
    const role = attrOf(el, 'role');
    if (role) out += ' role=' + role;
    const tabindex = attrOf(el, 'tabindex');
    if (tabindex !== null) out += ' tabindex=' + tabindex;
    const r = rect || (typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null);
    if (r) out += ` @${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`;

    if (verbose) {
      if (el.id) out += ' #' + el.id;
      const label = attrOf(el, 'aria-label') || textOf(el);
      if (label) out += ` "${label}"`;
      const href = attrOf(el, 'href');
      if (href) out += ' href=' + href;
      const tag = openingTag(el);
      if (tag) out += ' | ' + tag;
    }
    return out;
  }

  /** How many child elements an element may have for its text to be read. */
  const MAX_TEXT_CHILDREN = 20;

  /**
   * The start of an element's text. textContent builds the whole subtree's
   * text, which for <body> or a feed is megabytes on every step, so only a
   * small element is read.
   */
  function textOf(el) {
    if (typeof el.childElementCount === 'number' && el.childElementCount > MAX_TEXT_CHILDREN) return '';
    return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  }

  /** The element's own tag with its attributes; outerHTML would serialise every child too. */
  function openingTag(el) {
    const shallow = typeof el.cloneNode === 'function' ? el.cloneNode(false) : el;
    const html = typeof shallow.outerHTML === 'string' ? shallow.outerHTML : '';
    return html.slice(0, html.indexOf('>') + 1 || 150).slice(0, 150);
  }

  /** Values as they may appear in the log: primitives, with keys made safe. */
  function clean(fields) {
    const out = {};
    for (const name of Object.keys(fields || {})) {
      const value = fields[name];
      if (value === undefined) continue;
      if (name === 'key') out.key = safeKey(value);
      else if (value === null || typeof value === 'number' || typeof value === 'boolean') out[name] = value;
      else out[name] = String(value);
    }
    return out;
  }

  function push(kind, fields, isDetail) {
    if (!recording) return;
    const entry = { at: Date.now(), kind: kind, fields: clean(fields), detail: isDetail };
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.shift();
    if (verbose) console.log('[TUI] ' + formatEntry(entry));
  }

  /** Something the engine did. Always recorded. */
  function event(kind, fields) {
    push(kind, fields, false);
  }

  /** More about it, for admin mode only. */
  function detail(kind, fields) {
    if (verbose) push(kind, fields, true);
  }

  /**
   * Something threw. Its message can quote the page (a selector, a value), so
   * only its type and the place in the extension's own files are kept.
   */
  function error(where, err) {
    const stack = err && typeof err.stack === 'string' ? err.stack : '';
    const place = stack.match(/([\w-]+\.js):(\d+):\d+/);
    event('error', {
      where: where,
      type: (err && err.name) || typeof err,
      at: place ? `${place[1]}:${place[2]}` : undefined
    });
  }

  function formatValue(value) {
    const text = String(value);
    return /[\s"=]/.test(text) ? JSON.stringify(text) : text;
  }

  function formatEntry(entry) {
    const parts = [new Date(entry.at).toISOString(), (entry.detail ? '  ' : '') + entry.kind];
    for (const name of Object.keys(entry.fields)) {
      parts.push(name + '=' + formatValue(entry.fields[name]));
    }
    return parts.join(' ');
  }

  /**
   * The log as text, newest last, after a header. meta holds what the header
   * shows: version, site (a hostname, never a full address), browser, window.
   */
  function exportText(meta) {
    const lines = ['TUI Navigator log'];
    for (const name of Object.keys(meta || {})) lines.push(`${name}: ${meta[name]}`);
    lines.push(`verbose: ${verbose ? 'yes' : 'no'}`);
    lines.push(`events: ${entries.length} (the last ${MAX_ENTRIES} are kept)`);
    lines.push('');
    for (const entry of entries) lines.push(formatEntry(entry));
    return lines.join('\n');
  }

  function clear() {
    entries = [];
  }

  function setVerbose(on) {
    verbose = !!on;
  }

  function setRecording(on) {
    recording = !!on;
    if (!recording) clear();
  }

  root.TuiLog = {
    event: event,
    detail: detail,
    error: error,
    describe: describe,
    exportText: exportText,
    clear: clear,
    setVerbose: setVerbose,
    setRecording: setRecording,
    get verbose() { return verbose; },
    get size() { return entries.length; },
    MAX_ENTRIES: MAX_ENTRIES
  };

  // In the extension: only the top frame records, and admin mode sets verbose.
  if (typeof chrome === 'undefined' || !chrome.storage || typeof window === 'undefined') return;

  let top = true;
  try {
    top = window.top === window;
  } catch (e) {
    top = false;   // a cross-origin parent can make the comparison throw
  }
  if (!top) {
    setRecording(false);
    return;
  }

  try {
    chrome.storage.session.get(['tuiAdminMode'], (result) => {
      if (!chrome.runtime.lastError) setVerbose(result && result.tuiAdminMode);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'session' && changes.tuiAdminMode) {
        setVerbose(changes.tuiAdminMode.newValue);
        console.log(`[TUI] Verbose log ${verbose ? 'on' : 'off'} (admin mode).`);
      }
    });
  } catch (e) {
    // Session storage is out of reach in some contexts; the log stays plain.
  }

  // The report window asks, through background, when the user picks
  // "Report a problem" in the F10 menu. The log names the site by its hostname
  // only; the full address goes to the window apart from it, where the user
  // sees it in an edit box and decides how much of it the issue's title shows.
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'GET_TUI_LOG') return;
    const site = location.hostname || location.protocol.replace(':', '');
    sendResponse({
      site: site,
      url: location.href,
      text: exportText({
        version: chrome.runtime.getManifest().version,
        site: site,
        browser: navigator.userAgent,
        window: `${window.innerWidth}x${window.innerHeight}`,
        saved: new Date().toISOString()
      })
    });
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
