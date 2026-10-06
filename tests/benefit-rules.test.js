/**
 * Tests for the figures on the stats page's body figure and the website.
 *
 *   npm test
 *
 * The figures are estimates, so what matters is that they stay the cautious
 * ones the page explains: counted actions times the stated assumptions,
 * nothing invented for missing data, and the website's copies of the shared
 * files identical to the extension's.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

require('../src/benefit-rules.js');
const rules = globalThis.TuiBenefitRules;
const A = rules.ASSUMPTIONS;

test('computeBenefits multiplies the counts by the stated assumptions', () => {
  const b = rules.computeBenefits({ clicks: 40, arrows: 300, reaches: 10 });
  assert.equal(b.clicks, 40);
  assert.equal(b.reaches, 10);
  assert.equal(b.gripMinutes, (40 * A.gripSecondsPerClick + 300 * A.gripSecondsPerArrow) / 60);
  assert.equal(b.armMetres, 10 * A.armMetresPerReach);
});

test('computeBenefits treats missing or broken counts as none', () => {
  const b = rules.computeBenefits({ clicks: undefined, arrows: -5, reaches: NaN });
  assert.deepEqual(b, { clicks: 0, arrows: 0, reaches: 0, gripMinutes: 0, armMetres: 0 });
  assert.deepEqual(rules.computeBenefits(), b);
});

test('fromStats adds the four arrows and reads today from the per-day counts', () => {
  const now = new Date('2026-10-06T12:00:00Z');
  const { total, today } = rules.fromStats({
    pagesOpened: 12,
    keyBreakdown: { ArrowUp: 1, ArrowDown: 2, ArrowLeft: 3, ArrowRight: 4 },
    navBursts: 5,
    dailyBenefits: { '2026-10-06': { clicks: 2, arrows: 7, reaches: 1 }, '2026-10-05': { clicks: 9, arrows: 9, reaches: 9 } }
  }, now);
  assert.equal(total.clicks, 12);
  assert.equal(total.arrows, 10);
  assert.equal(total.reaches, 5);
  assert.equal(today.clicks, 2);
  assert.equal(today.arrows, 7);
  assert.equal(today.reaches, 1);
});

test('fromStats of a build that never counted reaches shows none, not a guess', () => {
  const { total, today } = rules.fromStats({ pagesOpened: 3 }, new Date('2026-10-06T12:00:00Z'));
  assert.equal(total.reaches, 0);
  assert.equal(today.clicks, 0);
});

test('a run of keys starts after a pause longer than burstGapMs, or with the first key', () => {
  assert.equal(rules.startsNewBurst(null, 1000), true);
  assert.equal(rules.startsNewBurst(1000, 1000 + A.burstGapMs), false);
  assert.equal(rules.startsNewBurst(1000, 1001 + A.burstGapMs), true);
});

test('addToDay counts into today and drops days older than KEEP_DAYS', () => {
  const now = new Date('2026-10-06T12:00:00Z');
  const daily = { '2026-08-01': { clicks: 1, arrows: 1, reaches: 1 } };
  rules.addToDay(daily, now, { click: true, reach: true });
  rules.addToDay(daily, now, { arrow: true });
  assert.deepEqual(daily, { '2026-10-06': { clicks: 1, arrows: 1, reaches: 1 } });
});

test('typicalWeek is TYPICAL_WEEK through the same sums', () => {
  const w = rules.TYPICAL_WEEK;
  assert.deepEqual(rules.typicalWeek(), rules.computeBenefits({
    clicks: w.days * w.clicksPerDay,
    arrows: w.days * w.arrowsPerDay,
    reaches: w.days * w.reachesPerDay
  }));
});

test('formatMinutes and formatDistance read naturally at every size', () => {
  assert.equal(rules.formatMinutes(0.5), '30 s');
  assert.equal(rules.formatMinutes(47.4), '47 min');
  assert.equal(rules.formatMinutes(185), '3 h 5 min');
  assert.equal(rules.formatMinutes(120), '2 h');
  assert.equal(rules.formatDistance(187.4), '187 m');
  assert.equal(rules.formatDistance(1234), '1.2 km');
  assert.equal(rules.formatDistance(14200), '14 km');
});

test('the website carries the same copies of the shared files', () => {
  const root = path.join(__dirname, '..');
  const pairs = [
    ['src/benefit-rules.js', 'docs/benefit/benefit-rules.js'],
    ['src/stats/benefit-figure.js', 'docs/benefit/benefit-figure.js'],
    ['src/stats/benefit-figure.css', 'docs/benefit/benefit-figure.css']
  ];
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
  for (const [from, to] of pairs) {
    assert.equal(read(to), read(from), `${to} differs from ${from}: run npm run sync-site-figure`);
  }
});
