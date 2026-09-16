/**
 * Tests for the excluded-sites matching rules.
 *
 *   npm test
 *
 * These rules decide whether the extension switches itself off on a page, so a
 * wrong answer is either a broken exclusion or an exclusion that silently covers
 * sites the user never listed. Plain Node, no framework, so CI needs no install.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

require('../src/site-rules.js');
const { normalizeDomain, matchesDomain, isExcluded, isValidDomain } = globalThis.TuiSiteRules;

test('normalizeDomain reduces anything a user might paste to a bare domain', () => {
  const cases = [
    ['example.com', 'example.com'],
    ['  example.com  ', 'example.com'],
    ['EXAMPLE.COM', 'example.com'],
    ['www.example.com', 'example.com'],
    ['WWW.Example.Com', 'example.com'],
    ['example.com:8080', 'example.com'],
    ['example.com/path/to/page', 'example.com'],
    ['example.com?a=b', 'example.com'],
    ['example.com#frag', 'example.com'],
    ['https://www.example.com/search?q=x#top', 'example.com'],
    ['http://example.com', 'example.com'],
    ['https://user:pw@example.com/x', 'example.com'],
    ['mail.google.com', 'mail.google.com'],
    ['example.co.uk', 'example.co.uk'],
    ['http://localhost:3000', 'localhost'],
    ['localhost', 'localhost'],
    ['xn--80ak6aa92e.com', 'xn--80ak6aa92e.com'] // punycode survives
  ];

  for (const [input, expected] of cases) {
    assert.equal(normalizeDomain(input), expected, `normalizeDomain(${JSON.stringify(input)})`);
  }
});

test('normalizeDomain rejects input that is not a domain', () => {
  const rejected = [
    '',
    '   ',
    'settings',              // bare label, almost certainly a typo
    '...',
    '.example.com',
    'example.com.',
    'a..b.com',
    '-bad.com',
    'bad-.com',
    'has space.com',
    'chrome://extensions',   // no host at all
    'about:blank',
    'file:///c:/tmp/x.html',
    'http://',
    null,
    undefined,
    42,
    {},
    []
  ];

  for (const input of rejected) {
    assert.equal(normalizeDomain(input), null, `normalizeDomain(${JSON.stringify(input)})`);
  }
});

test('normalizeDomain enforces DNS length limits', () => {
  const longLabel = 'a'.repeat(64);
  assert.equal(normalizeDomain(`${longLabel}.com`), null, 'label over 63 chars');

  const okLabel = 'a'.repeat(63);
  assert.equal(normalizeDomain(`${okLabel}.com`), `${okLabel}.com`, 'label of exactly 63 chars');

  const tooLong = `${'a'.repeat(60)}.`.repeat(5) + 'com';
  assert.equal(normalizeDomain(tooLong), null, 'name over 253 chars');
});

test('matchesDomain covers subdomains but not lookalikes', () => {
  // Covered.
  assert.equal(matchesDomain('google.com', 'google.com'), true);
  assert.equal(matchesDomain('www.google.com', 'google.com'), true);
  assert.equal(matchesDomain('mail.google.com', 'google.com'), true);
  assert.equal(matchesDomain('a.b.c.google.com', 'google.com'), true);

  // Not covered. The last two are the ones worth caring about: a prefix match
  // or a naive "contains" check would wrongly silence both.
  assert.equal(matchesDomain('notgoogle.com', 'google.com'), false);
  assert.equal(matchesDomain('google.co', 'google.com'), false);
  assert.equal(matchesDomain('google.com.evil.com', 'google.com'), false);
  assert.equal(matchesDomain('evilgoogle.com', 'google.com'), false);
  assert.equal(matchesDomain('xgoogle.com', 'google.com'), false);
});

test('matchesDomain is case-insensitive on the hostname', () => {
  // Browsers hand back a lowercase hostname, but the list is user-entered and
  // the check should not depend on that.
  assert.equal(matchesDomain('MAIL.GOOGLE.COM', 'google.com'), true);
  assert.equal(matchesDomain('  Mail.Google.Com  ', 'google.com'), true);
});

test('matchesDomain treats missing input as no match', () => {
  assert.equal(matchesDomain(null, 'google.com'), false);
  assert.equal(matchesDomain('', 'google.com'), false);
  assert.equal(matchesDomain('google.com', null), false);
  assert.equal(matchesDomain('google.com', ''), false);
  assert.equal(matchesDomain(undefined, undefined), false);
});

test('isExcluded checks the hostname against every rule', () => {
  const list = ['github.com', 'google.com', 'news.ycombinator.com'];

  assert.equal(isExcluded('mail.google.com', list), true, 'subdomain of a listed rule');
  assert.equal(isExcluded('github.com', list), true, 'exact match');
  assert.equal(isExcluded('example.com', list), false, 'unrelated host');
  assert.equal(isExcluded('ycombinator.com', list), false, 'parent of a rule is not covered');
});

test('isExcluded fails safe when there is nothing to match', () => {
  // The engine calls this before a hostname is known, and on pages that have
  // none at all. It must never throw and never exclude by accident.
  assert.equal(isExcluded(null, ['google.com']), false);
  assert.equal(isExcluded(undefined, ['google.com']), false);
  assert.equal(isExcluded('', ['google.com']), false);
  assert.equal(isExcluded('google.com', []), false);
  assert.equal(isExcluded('google.com', null), false);
  assert.equal(isExcluded('google.com', undefined), false);
  assert.equal(isExcluded('google.com', 'google.com'), false, 'a string is not a list');
});

test('a normalized domain always matches the host it came from', () => {
  // The popup stores normalizeDomain(input) and the engine matches the raw
  // hostname against it, so the two have to agree.
  const pairs = [
    ['https://www.example.com/x', 'www.example.com'],
    ['https://www.example.com/x', 'example.com'],
    ['mail.google.com', 'mail.google.com'],
    ['GOOGLE.COM:443', 'www.google.com']
  ];

  for (const [typed, hostname] of pairs) {
    const stored = normalizeDomain(typed);
    assert.ok(stored, `${typed} should normalize`);
    assert.equal(matchesDomain(hostname, stored), true, `${hostname} vs stored ${stored}`);
  }
});

test('isValidDomain agrees with normalizeDomain on already-clean input', () => {
  for (const good of ['example.com', 'a.b.example.com', 'localhost', 'example.co.uk']) {
    assert.equal(isValidDomain(good), true, good);
    assert.equal(normalizeDomain(good), good, good);
  }
  for (const bad of ['', 'settings', '.com', 'a..b']) {
    assert.equal(isValidDomain(bad), false, bad);
  }
});
