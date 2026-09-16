/**
 * Rules for the weekly recap notification.
 *
 * Kept free of Chrome APIs and of the current clock so the decision can be
 * exercised against any date without waiting a week for Thursday. background.js
 * reads the state, asks this, and does what it is told.
 */
(function (root) {
  'use strict';

  // 0 = Sunday. Thursday is the intended day; Friday and Saturday are the grace
  // window for someone who did not open the browser on Thursday. All three fall
  // in the same ISO week, so lastRecapWeek still prevents a second send.
  const RECAP_DAYS = [4, 5, 6];
  const EARLIEST_HOUR = 10;
  const MIN_AGE_DAYS = 7;
  const WINDOW_DAYS = 7;

  /** "2026-W38". Weeks run Monday to Sunday, per ISO 8601. */
  function isoWeekKey(date) {
    // Work in UTC off the local calendar date, so the arithmetic cannot be
    // shifted by the local offset.
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;              // Monday 1 … Sunday 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);      // the Thursday of this week
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  /** Whole days from a "YYYY-MM-DD" stamp to now, read as local calendar days. */
  function daysSince(dateStamp, now) {
    if (!dateStamp) return null;
    const parts = String(dateStamp).slice(0, 10).split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;

    const then = new Date(parts[0], parts[1] - 1, parts[2]);
    if (Number.isNaN(then.getTime())) return null;

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.floor((today - then) / 86400000);
  }

  /**
   * Total actions over the trailing week. dailyActions is keyed by UTC date,
   * the way background.js writes it, so the keys are built the same way here.
   */
  function sumRecentDays(dailyActions, now, days) {
    if (!dailyActions || typeof dailyActions !== 'object') return 0;
    const span = days || WINDOW_DAYS;
    let total = 0;

    for (let i = 0; i < span; i++) {
      const d = new Date(now.getTime() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      const value = dailyActions[key];
      if (typeof value === 'number' && Number.isFinite(value)) total += value;
    }
    return total;
  }

  /**
   * @returns {{send: boolean, reason: string, week: string}} reason explains a
   * refusal too, which is what the test button in the popup reports back.
   */
  function shouldSendRecap(now, state) {
    const s = state || {};
    const week = isoWeekKey(now);

    if (s.enabled === false) return { send: false, reason: 'disabled', week };

    const age = daysSince(s.installedAt, now);
    if (age === null) return { send: false, reason: 'install-date-unknown', week };
    if (age < MIN_AGE_DAYS) return { send: false, reason: 'too-new', week };

    if (!RECAP_DAYS.includes(now.getDay())) return { send: false, reason: 'wrong-day', week };
    if (now.getHours() < EARLIEST_HOUR) return { send: false, reason: 'too-early', week };
    if (s.lastRecapWeek === week) return { send: false, reason: 'already-sent', week };

    const actions = sumRecentDays(s.dailyActions, now, WINDOW_DAYS);
    if (actions <= 0) return { send: false, reason: 'no-activity', week };

    return { send: true, reason: 'ok', week };
  }

  const DIRECTION_NAMES = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right'
  };

  /** The line the notification shows. Facts the user earned, not a nudge. */
  function describeWeek(stats) {
    const s = stats || {};
    const actions = sumRecentDays(s.dailyActions, s.now || new Date(), WINDOW_DAYS);
    const parts = [`${actions.toLocaleString()} keys pressed`];

    if (typeof s.pagesOpened === 'number' && s.pagesOpened > 0) {
      parts.push(`${s.pagesOpened.toLocaleString()} pages opened all time`);
    }

    const breakdown = s.keyBreakdown || {};
    let top = null;
    for (const key of Object.keys(DIRECTION_NAMES)) {
      const count = breakdown[key];
      if (typeof count === 'number' && (!top || count > breakdown[top])) top = key;
    }
    if (top && breakdown[top] > 0) parts.push(`mostly ${DIRECTION_NAMES[top]}`);

    return parts.join(' · ');
  }

  root.TuiRecapRules = {
    isoWeekKey,
    daysSince,
    sumRecentDays,
    shouldSendRecap,
    describeWeek,
    RECAP_DAYS,
    EARLIEST_HOUR,
    MIN_AGE_DAYS,
    WINDOW_DAYS
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
