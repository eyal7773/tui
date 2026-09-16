/**
 * Tests for the weekly recap decision.
 *
 * This is the part that cannot be checked by using the extension: waiting for
 * Thursday is not a test strategy. Every case here fakes the clock instead.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

require('../src/recap-rules.js');
const {
  isoWeekKey, daysSince, sumRecentDays, shouldSendRecap, describeWeek
} = globalThis.TuiRecapRules;

// 2026-09-17 is a Thursday. Local time, which is what the rules read.
const THU = (h = 12) => new Date(2026, 8, 17, h, 0, 0);
const FRI = (h = 12) => new Date(2026, 8, 18, h, 0, 0);
const SAT = (h = 12) => new Date(2026, 8, 19, h, 0, 0);
const SUN = (h = 12) => new Date(2026, 8, 20, h, 0, 0);
const WED = (h = 12) => new Date(2026, 8, 16, h, 0, 0);

/** dailyActions covering the trailing week, keyed the way background.js keys it. */
function activity(now, perDay = 50) {
  const out = {};
  for (let i = 0; i < 7; i++) {
    out[new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10)] = perDay;
  }
  return out;
}

function baseState(now) {
  return {
    enabled: true,
    installedAt: '2026-08-01',      // comfortably older than a week
    lastRecapWeek: null,
    dailyActions: activity(now)
  };
}

test('sends on Thursday once every condition holds', () => {
  const now = THU();
  const result = shouldSendRecap(now, baseState(now));
  assert.equal(result.send, true);
  assert.equal(result.reason, 'ok');
});

test('the grace window covers Friday and Saturday but stops there', () => {
  for (const day of [THU, FRI, SAT]) {
    const now = day();
    assert.equal(shouldSendRecap(now, baseState(now)).send, true, `${now}`);
  }
  for (const day of [SUN, WED]) {
    const now = day();
    const r = shouldSendRecap(now, baseState(now));
    assert.equal(r.send, false, `${now}`);
    assert.equal(r.reason, 'wrong-day');
  }
});

test('nothing fires before the morning cutoff', () => {
  const early = THU(9);
  assert.equal(shouldSendRecap(early, baseState(early)).reason, 'too-early');

  const onTheHour = THU(10);
  assert.equal(shouldSendRecap(onTheHour, baseState(onTheHour)).send, true);
});

test('a fresh install waits out its first week', () => {
  const now = THU();

  const state = { ...baseState(now), installedAt: '2026-09-14' }; // 3 days old
  assert.equal(shouldSendRecap(now, state).reason, 'too-new');

  const exactlySeven = { ...baseState(now), installedAt: '2026-09-10' };
  assert.equal(shouldSendRecap(now, exactlySeven).send, true, 'day seven qualifies');

  const sixDays = { ...baseState(now), installedAt: '2026-09-11' };
  assert.equal(shouldSendRecap(now, sixDays).reason, 'too-new');
});

test('an unknown install date never sends', () => {
  const now = THU();
  for (const bad of [null, undefined, '', 'nonsense']) {
    const r = shouldSendRecap(now, { ...baseState(now), installedAt: bad });
    assert.equal(r.send, false, JSON.stringify(bad));
    assert.equal(r.reason, 'install-date-unknown');
  }
});

test('only one notification per week, across the whole grace window', () => {
  // Sent on Thursday; Friday and Saturday must stay quiet.
  const thu = THU();
  const week = shouldSendRecap(thu, baseState(thu)).week;

  for (const day of [THU, FRI, SAT]) {
    const now = day();
    const state = { ...baseState(now), lastRecapWeek: week };
    assert.equal(shouldSendRecap(now, state).reason, 'already-sent', `${now}`);
  }
});

test('the next week opens again', () => {
  const thisWeek = shouldSendRecap(THU(), baseState(THU())).week;
  const nextThu = new Date(2026, 8, 24, 12);
  const state = { ...baseState(nextThu), lastRecapWeek: thisWeek };
  assert.equal(shouldSendRecap(nextThu, state).send, true);
});

test('a silent week produces no notification', () => {
  const now = THU();
  for (const empty of [{}, null, undefined]) {
    const r = shouldSendRecap(now, { ...baseState(now), dailyActions: empty });
    assert.equal(r.send, false);
    assert.equal(r.reason, 'no-activity');
  }
});

test('switching it off wins over everything else', () => {
  const now = THU();
  const r = shouldSendRecap(now, { ...baseState(now), enabled: false });
  assert.equal(r.reason, 'disabled');
});

test('isoWeekKey groups the grace window together and splits real weeks', () => {
  assert.equal(isoWeekKey(THU()), isoWeekKey(FRI()));
  assert.equal(isoWeekKey(THU()), isoWeekKey(SAT()));
  assert.equal(isoWeekKey(THU()), isoWeekKey(SUN()), 'Sunday closes the ISO week');
  assert.notEqual(isoWeekKey(THU()), isoWeekKey(new Date(2026, 8, 24)), 'next Thursday');
  assert.match(isoWeekKey(THU()), /^\d{4}-W\d{2}$/);
});

test('isoWeekKey survives the year boundary', () => {
  // 2026-12-31 is a Thursday, so it belongs to week 53 of 2026.
  assert.equal(isoWeekKey(new Date(2026, 11, 31)), '2026-W53');
  // 2027-01-01 is the Friday of that same ISO week.
  assert.equal(isoWeekKey(new Date(2027, 0, 1)), '2026-W53');
  // A year rollover must not let a second notification through.
  assert.equal(isoWeekKey(new Date(2026, 11, 31)), isoWeekKey(new Date(2027, 0, 1)));
});

test('sumRecentDays counts the trailing week and nothing older', () => {
  const now = THU();
  const key = (offset) => new Date(now.getTime() - offset * 86400000).toISOString().slice(0, 10);

  const daily = { [key(0)]: 10, [key(3)]: 5, [key(6)]: 1, [key(7)]: 999, [key(30)]: 999 };
  assert.equal(sumRecentDays(daily, now, 7), 16, 'day 7 and beyond are outside the window');

  assert.equal(sumRecentDays(null, now, 7), 0);
  assert.equal(sumRecentDays({ [key(0)]: 'lots' }, now, 7), 0, 'non-numbers ignored');
});

test('daysSince reads whole calendar days', () => {
  const now = new Date(2026, 8, 17, 23, 59);
  assert.equal(daysSince('2026-09-17', now), 0, 'same day regardless of the hour');
  assert.equal(daysSince('2026-09-10', now), 7);
  assert.equal(daysSince(null, now), null);
  assert.equal(daysSince('not-a-date', now), null);
});

test('describeWeek reports facts and skips what it does not have', () => {
  const now = THU();
  const text = describeWeek({
    now,
    dailyActions: activity(now, 100),
    pagesOpened: 42,
    keyBreakdown: { ArrowUp: 3, ArrowDown: 90, ArrowLeft: 1, ArrowRight: 2 }
  });

  assert.match(text, /700 keys pressed/);
  assert.match(text, /42 pages opened/);
  assert.match(text, /mostly down/);

  // With nothing to add it still returns a sensible single fact.
  const bare = describeWeek({ now, dailyActions: {} });
  assert.match(bare, /0 keys pressed/);
  assert.doesNotMatch(bare, /mostly/);
});
