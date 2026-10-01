/**
 * Tests for the link that opens a bug report as a new GitHub issue.
 *
 *   npm test
 *
 * The title has to carry the page's address, the body has to hold the
 * description and the log, and the link has to stay short enough for
 * GitHub's sign-in page to carry it back, however long the log or the
 * description is.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

require('../src/report/issue-link.js');
const { issueUrl, title, fits, ISSUES_URL } = globalThis.TuiIssueLink;

const LOG_HEADER = 'TUI Navigator log\nversion: 0.1.100\nsite: mail.google.com\nverbose: no\nevents: 20 (the last 20 are kept)';

function logWith(count, width = 120) {
  const events = [];
  for (let i = 0; i < count; i++) events.push(`event-${String(i).padStart(2, '0')} ` + 'x'.repeat(width));
  return `${LOG_HEADER}\n\n${events.join('\n')}`;
}

function parse(url) {
  const u = new URL(url);
  return { base: `${u.origin}${u.pathname}`, title: u.searchParams.get('title'), body: u.searchParams.get('body') };
}

const ADDRESS = 'https://mail.google.com/mail/u/0/#inbox';

test('the title is the address and the first line of the description', () => {
  assert.equal(title(ADDRESS, 'Enter does nothing\non the second row'),
    `Problem on ${ADDRESS}: Enter does nothing`);
});

test('without a description the title is the address alone', () => {
  assert.equal(title(ADDRESS, '  '), `Problem on ${ADDRESS}`);
});

test('a long title is cut short', () => {
  const t = title('https://example.com/' + 'a'.repeat(400), 'b'.repeat(400));
  assert.ok(t.length <= 200, `title is ${t.length} long`);
  assert.ok(t.startsWith('Problem on https://example.com/'));
});

test('the link opens a new issue with the title, description, address and log', () => {
  const p = parse(issueUrl({ address: ADDRESS, description: 'It skipped a row.', log: logWith(3) }));
  assert.equal(p.base, ISSUES_URL);
  assert.equal(p.title, `Problem on ${ADDRESS}: It skipped a row.`);
  assert.match(p.body, /### What happened\nIt skipped a row\./);
  assert.match(p.body, /### Page\nhttps:\/\/mail\.google\.com\/mail\/u\/0\/#inbox/);
  assert.match(p.body, /event-00/);
  assert.match(p.body, /event-02/);
  assert.match(p.body, /press the green "Create" button/);
});

test('the body asks for the file only when there is one', () => {
  const without = parse(issueUrl({ address: ADDRESS, description: 'x', log: logWith(1) }));
  assert.doesNotMatch(without.body, /Copy of the page/);
  const withFile = parse(issueUrl({ address: ADDRESS, description: 'x', log: logWith(1), fileName: 'tui-report-1.zip' }));
  assert.match(withFile.body, /### Copy of the page\n<!-- Drag the file tui-report-1\.zip/);
});

test('a long log loses its oldest events, keeps its header, and says so', () => {
  const url = issueUrl({ address: ADDRESS, description: 'x', log: logWith(20, 600) });
  assert.ok(fits(url), `link is ${url.length} long`);
  const p = parse(url);
  assert.match(p.body, /^version: 0\.1\.100$/m);
  assert.match(p.body, /event-19/);
  assert.doesNotMatch(p.body, /event-00/);
  assert.match(p.body, /oldest events were left out/);
});

test('a description too long for any link is cut, and says so', () => {
  const url = issueUrl({ address: ADDRESS, description: 'word '.repeat(5000), log: logWith(20) });
  assert.ok(fits(url), `link is ${url.length} long`);
  assert.match(parse(url).body, /The rest of the description was too long/);
});

test('a plain log of 20 events goes whole', () => {
  const url = issueUrl({ address: ADDRESS, description: 'x', log: logWith(20, 100) });
  assert.match(parse(url).body, /event-00/);
  assert.doesNotMatch(parse(url).body, /left out/);
});
