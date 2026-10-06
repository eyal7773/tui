/**
 * What the keyboard spared the body: the numbers behind the dashboard's
 * figure and the one on the website.
 *
 * Nothing here is measured on the body. Each figure is an action the
 * extension counted (an Enter that would have been a click, an arrow that
 * would have been pointer travel or a scroll, a run of keys that would have
 * started with a reach for the mouse) times a cautious estimate. Every
 * estimate lives in ASSUMPTIONS, so the page can say what it rests on and a
 * change happens in one place.
 *
 * Shared by the background worker (counting), the stats page and the site
 * (showing), so it runs without Chrome and is tested on its own.
 */
(function (root) {
  'use strict';

  const ASSUMPTIONS = {
    // Pointing at a target and clicking it, hand on the mouse the whole time.
    gripSecondsPerClick: 1.5,
    // An arrow stands in for a short pointer move or a turn of the wheel.
    gripSecondsPerArrow: 0.4,
    // Keyboard to mouse and back, about 30 cm each way.
    armMetresPerReach: 0.6,
    // A pause this long ends a run of keys. Without the extension the next
    // run would have started by reaching for the mouse.
    burstGapMs: 10000
  };

  // How long the per-day counts are kept, like dailyActions.
  const KEEP_DAYS = 30;

  // The week the website shows. Not anyone's data: a modest working week,
  // stated on the page as what it is.
  const TYPICAL_WEEK = { days: 5, clicksPerDay: 80, arrowsPerDay: 400, reachesPerDay: 60 };

  function count(n) {
    return typeof n === 'number' && isFinite(n) && n > 0 ? n : 0;
  }

  /** The three figures from three counts. */
  function computeBenefits(counts) {
    const c = counts || {};
    const clicks = count(c.clicks);
    const arrows = count(c.arrows);
    const reaches = count(c.reaches);
    const gripSeconds = clicks * ASSUMPTIONS.gripSecondsPerClick + arrows * ASSUMPTIONS.gripSecondsPerArrow;
    return {
      clicks,
      arrows,
      reaches,
      gripMinutes: gripSeconds / 60,
      armMetres: reaches * ASSUMPTIONS.armMetresPerReach
    };
  }

  function dayKey(date) {
    return date.toISOString().slice(0, 10);
  }

  function sumArrows(keyBreakdown) {
    const k = keyBreakdown || {};
    return count(k.ArrowUp) + count(k.ArrowDown) + count(k.ArrowLeft) + count(k.ArrowRight);
  }

  /**
   * All time and today, from what chrome.storage.local holds. Clicks and
   * arrows go back to the first use; reaches only to the build that started
   * counting them (navBursts), since no earlier record says where runs began.
   */
  function fromStats(stats, now) {
    const s = stats || {};
    const day = (s.dailyBenefits || {})[dayKey(now || new Date())] || {};
    return {
      total: computeBenefits({ clicks: s.pagesOpened, arrows: sumArrows(s.keyBreakdown), reaches: s.navBursts }),
      today: computeBenefits(day)
    };
  }

  /** Does a key at `now` start a new run? `lastAt` is the previous key, or null. */
  function startsNewBurst(lastAt, now) {
    return typeof lastAt !== 'number' || now - lastAt > ASSUMPTIONS.burstGapMs;
  }

  /**
   * Adds one action to the per-day counts and drops days older than
   * KEEP_DAYS. Changes `daily` in place and returns it.
   */
  function addToDay(daily, now, action) {
    const key = dayKey(now);
    const day = daily[key] || (daily[key] = { clicks: 0, arrows: 0, reaches: 0 });
    if (action.click) day.clicks++;
    if (action.arrow) day.arrows++;
    if (action.reach) day.reaches++;

    const oldest = new Date(now);
    oldest.setDate(oldest.getDate() - KEEP_DAYS);
    for (const k of Object.keys(daily)) {
      if (new Date(k) < oldest) delete daily[k];
    }
    return daily;
  }

  /** The figures for TYPICAL_WEEK. */
  function typicalWeek() {
    const w = TYPICAL_WEEK;
    return computeBenefits({
      clicks: w.days * w.clicksPerDay,
      arrows: w.days * w.arrowsPerDay,
      reaches: w.days * w.reachesPerDay
    });
  }

  /** "45 s", "47 min", "3 h 5 min". */
  function formatMinutes(minutes) {
    const m = count(minutes);
    if (m < 1) return `${Math.round(m * 60)} s`;
    if (m < 60) return `${Math.round(m)} min`;
    const h = Math.floor(m / 60);
    const rest = Math.round(m - h * 60);
    return rest ? `${h} h ${rest} min` : `${h} h`;
  }

  /** "18 m", "1.2 km", "14 km". */
  function formatDistance(metres) {
    const m = count(metres);
    if (m < 1000) return `${Math.round(m)} m`;
    const km = m / 1000;
    return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
  }

  root.TuiBenefitRules = {
    ASSUMPTIONS,
    KEEP_DAYS,
    TYPICAL_WEEK,
    computeBenefits,
    fromStats,
    startsNewBurst,
    addToDay,
    typicalWeek,
    formatMinutes,
    formatDistance
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
