/**
 * Tests for the log a bug report carries.
 *
 *   npm test
 *
 * The log is recorded all the time, for everyone, so what matters most is what
 * it never holds: the page's text, labels, links and ids, and any key the user
 * typed. The elements here are plain objects in the shape describe() reads.
 */

const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');

require('../src/tui-log.js');
const log = globalThis.TuiLog;

/** Enough of an element for describe(): tag, attributes, text and markup. */
function el(tagName, attrs = {}, text = '') {
  return {
    tagName: tagName.toUpperCase(),
    id: attrs.id || '',
    className: attrs.class || '',
    textContent: text,
    outerHTML: `<${tagName} secret-markup>${text}</${tagName}>`,
    getAttribute: (name) => (name in attrs ? attrs[name] : null)
  };
}

const RECT = { left: 10.4, top: 20.6, width: 100, height: 30 };

beforeEach(() => {
  log.setVerbose(false);
  log.setRecording(true);
  log.clear();
});

test('an element is its shape: tag, a few classes, role, tabindex and place', () => {
  const row = el('tr', { class: 'qwPkcb yjl6dc O5x1db Ss7qXc', role: 'row', tabindex: '0' });
  assert.equal(log.describe(row, RECT), 'TR.qwPkcb.yjl6dc.O5x1db role=row tabindex=0 @10,21 100x30');
});

test('nothing the user could read on the page gets into the log', () => {
  const link = el('a', {
    id: 'user-dana@example.com', class: 'file', href: '/d/secret-doc-id',
    'aria-label': 'Salary 2026.xlsx', 'data-id': '187RqVAbBNqatb'
  }, 'Salary 2026.xlsx');
  log.event('focus', { to: log.describe(link, RECT) });
  const text = log.exportText({ site: 'drive.google.com' });
  for (const secret of ['dana', 'Salary', 'secret-doc-id', '187RqVAbBNqatb', 'secret-markup']) {
    assert.ok(!text.includes(secret), `the log holds "${secret}"`);
  }
});

test('in admin mode an element also carries its id, label, link and markup', () => {
  log.setVerbose(true);
  const link = el('a', { id: 'go', href: '/next', 'aria-label': 'Next page' });
  const text = log.describe(link, RECT);
  assert.ok(text.includes('#go'));
  assert.ok(text.includes('"Next page"'));
  assert.ok(text.includes('href=/next'));
  assert.ok(text.includes('secret-markup'));
});

test('in admin mode a big container is not read whole: no text, and only its opening tag', () => {
  log.setVerbose(true);
  const feed = el('div', { class: 'feed' }, 'first story second story third story');
  feed.childElementCount = 200;
  feed.outerHTML = '<div class="feed"><article>first story</article></div>';
  feed.cloneNode = () => ({ outerHTML: '<div class="feed"></div>' });
  const text = log.describe(feed, RECT);
  assert.ok(!text.includes('story'), text);
  assert.ok(text.endsWith('| <div class="feed">'), text);
});

test('nothing to describe is "none"', () => {
  assert.equal(log.describe(null), 'none');
  assert.equal(log.describe(undefined), 'none');
});

test('a typed character is never recorded, only the keys the engine acts on', () => {
  log.event('key', { key: 'ArrowDown' });
  log.event('key', { key: 'p' });
  log.event('key', { key: 'Enter' });
  const text = log.exportText({});
  assert.ok(text.includes('key=ArrowDown'));
  assert.ok(text.includes('key=Enter'));
  assert.ok(text.includes('key=other'));
  assert.ok(!/key=p\b/.test(text));
});

test('only the last 20 events are kept', () => {
  assert.equal(log.MAX_ENTRIES, 20);
  for (let i = 0; i < 100; i++) log.event('step', { n: i });
  assert.equal(log.size, 20);
  const lines = log.exportText({}).split('\n').filter(l => / step n=/.test(l));
  assert.equal(lines.length, 20);
  assert.ok(lines[0].endsWith('n=80'));
  assert.ok(lines[19].endsWith('n=99'));
});

test('an error keeps its type and place in the extension, never its message', () => {
  const err = new TypeError("'#dana@example.com' is not a valid selector");
  err.stack = "TypeError: '#dana@example.com' is not a valid selector\n" +
    '    at SpatialEngine.findBestCandidate (chrome-extension://abc/engine.js:2400:17)';
  log.error('navigate', err);
  const text = log.exportText({});
  assert.match(text, /error where=navigate type=TypeError at=engine\.js:2400$/m);
  assert.ok(!text.includes('dana'));
});

test('detail events are kept in admin mode only', () => {
  log.detail('candidates', { count: 3 });
  assert.equal(log.size, 0);
  log.setVerbose(true);
  const print = console.log;
  console.log = () => {};
  try {
    log.detail('candidates', { count: 3 });
  } finally {
    console.log = print;
  }
  assert.equal(log.size, 1);
});

test('a frame that does not record keeps nothing', () => {
  log.setRecording(false);
  log.event('navigate', { key: 'ArrowDown' });
  assert.equal(log.size, 0);
});

test('the export starts with a header and quotes values that have spaces', () => {
  log.event('click', { target: 'TR role=row @1,2 3x4', count: 2, dblclick: true });
  const text = log.exportText({ version: '1.3.1', site: 'drive.google.com' });
  const lines = text.split('\n');
  assert.equal(lines[0], 'TUI Navigator log');
  assert.ok(lines.includes('version: 1.3.1'));
  assert.ok(lines.includes('site: drive.google.com'));
  assert.ok(lines.includes('verbose: no'));
  assert.match(text, /Z click target="TR role=row @1,2 3x4" count=2 dblclick=true$/m);
});
