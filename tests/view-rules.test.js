/**
 * Tests for which rectangles count as reachable.
 *
 * The bug this band exists to prevent is subtle from a screenshot: everything
 * looks fine, the ring just leaves the column you were reading whenever the
 * next row happens to sit a few pixels below the fold. So the cases below are
 * written in terms of that fold, not in terms of round numbers.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

require('../src/view-rules.js');
const { withinReach, onScreen, bandFor, VERTICAL_REACH_RATIO } = globalThis.TuiViewRules;

const VIEW = { width: 1000, height: 800 };

/** left, top, width, height -> the corners the rules read. */
function r(left, top, width, height) {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

const MARGIN = VIEW.height * VERTICAL_REACH_RATIO;

/* ── the band itself ────────────────────────────────────────────────────── */

test('the band reaches half a screen past the top and bottom', () => {
  const band = bandFor(VIEW);
  assert.equal(band.top, -MARGIN);
  assert.equal(band.bottom, VIEW.height + MARGIN);
});

test('the band does not reach past the sides', () => {
  const band = bandFor(VIEW);
  assert.equal(band.left, 0);
  assert.equal(band.right, VIEW.width);
});

test('the margin scales with the window rather than being a fixed pixel count', () => {
  assert.equal(bandFor({ width: 800, height: 400 }).bottom, 400 + 400 * VERTICAL_REACH_RATIO);
  assert.equal(bandFor({ width: 800, height: 1600 }).bottom, 1600 + 1600 * VERTICAL_REACH_RATIO);
});

/* ── what is reachable ──────────────────────────────────────────────────── */

test('anything on screen is reachable', () => {
  assert.equal(withinReach(r(100, 100, 200, 40), VIEW), true);
  assert.equal(withinReach(r(0, 0, VIEW.width, VIEW.height), VIEW), true);
});

test('the row just past the fold is reachable', () => {
  // This is the case that broke: the next search result starts 42px below the
  // last thing on screen, so clipping at the fold hid it from the engine.
  assert.equal(withinReach(r(100, VIEW.height + 42, 240, 53), VIEW), true);
});

test('a sidebar item that is slightly higher no longer wins by default', () => {
  // Both of these were on the page at once. Before the band, only the sidebar
  // one survived the filter, so ArrowDown had nothing else to choose.
  const nextInColumn = r(100, VIEW.height + 42, 240, 53);   // just past the fold
  const sidebarItem = r(860, VIEW.height - 20, 98, 24);     // just above it
  assert.equal(withinReach(nextInColumn, VIEW), true);
  assert.equal(withinReach(sidebarItem, VIEW), true);
});

test('the footer of a long page stays out of reach', () => {
  assert.equal(withinReach(r(100, VIEW.height + MARGIN + 1, 200, 40), VIEW), false);
});

test('content scrolled off the top is reachable for the same distance', () => {
  assert.equal(withinReach(r(100, -MARGIN + 10, 200, 40), VIEW), true);
  assert.equal(withinReach(r(100, -MARGIN - 100, 200, 40), VIEW), false);
});

test('a rectangle straddling an edge counts', () => {
  assert.equal(withinReach(r(100, VIEW.height - 5, 200, 400), VIEW), true);
  assert.equal(withinReach(r(100, -20, 200, 40), VIEW), true);
});

/* ── sideways stays strict ──────────────────────────────────────────────── */

test('a drawer parked off to the side stays unreachable', () => {
  // Off-canvas menus sit just beyond an edge without being hidden. Giving them
  // the same margin as the fold would make them navigable while closed.
  assert.equal(withinReach(r(VIEW.width + 1, 100, 300, 600), VIEW), false);
  assert.equal(withinReach(r(-320, 100, 300, 600), VIEW), false);
});

test('a rectangle touching a side edge still counts', () => {
  assert.equal(withinReach(r(VIEW.width - 1, 100, 300, 40), VIEW), true);
  assert.equal(withinReach(r(-299, 100, 300, 40), VIEW), true);
});

/* ── onScreen ───────────────────────────────────────────────────────────── */

test('onScreen is the strict check, with no margin at all', () => {
  const pastFold = r(100, VIEW.height + 42, 240, 53);
  assert.equal(withinReach(pastFold, VIEW), true);
  assert.equal(onScreen(pastFold, VIEW), false);
  assert.equal(onScreen(r(100, 100, 200, 40), VIEW), true);
});

/* ── nothing to measure against ─────────────────────────────────────────── */

test('a missing rectangle is not reachable', () => {
  assert.equal(withinReach(null, VIEW), false);
  assert.equal(withinReach(undefined, VIEW), false);
});

test('with no window to measure against, nothing is filtered out', () => {
  // Better to offer a candidate than to silently drop every one of them.
  assert.equal(withinReach(r(100, 100, 200, 40), null), true);
});

test('a bar along the bottom edge is reserved (The Guardian support banner)', () => {
  const { coveredEdges } = globalThis.TuiViewRules;
  // Exact: the banner starts at 492 in a 900px window.
  assert.deepEqual(coveredEdges(900, [{ top: 492, bottom: 900 }]), { top: 0, bottom: 408 });
});

test('a pinned header is reserved at the top, and the taller of two bars wins', () => {
  const { coveredEdges } = globalThis.TuiViewRules;
  assert.deepEqual(coveredEdges(900, [{ top: 0, bottom: 64 }, { top: 0, bottom: 40 }]), { top: 64, bottom: 0 });
});

test('full-screen dialogs and bars away from the edges reserve nothing', () => {
  const { coveredEdges } = globalThis.TuiViewRules;
  assert.deepEqual(coveredEdges(900, [{ top: 0, bottom: 900 }]), { top: 0, bottom: 0 }, 'covers both edges');
  assert.deepEqual(coveredEdges(900, [{ top: 300, bottom: 900 }]), { top: 0, bottom: 0 }, 'two thirds of the window');
  assert.deepEqual(coveredEdges(900, [{ top: 200, bottom: 300 }]), { top: 0, bottom: 0 }, 'floating mid-screen');
  assert.deepEqual(coveredEdges(900, [{ top: 0, bottom: 0 }, null]), { top: 0, bottom: 0 }, 'empty');
  assert.deepEqual(coveredEdges(undefined, [{ top: 0, bottom: 50 }]), { top: 0, bottom: 0 }, 'no window');
});

test('a card floating a margin above the edge counts only when slack allows it (Stack Overflow cookies)', () => {
  const { coveredEdges } = globalThis.TuiViewRules;
  const card = { top: 705, bottom: 884 };
  assert.deepEqual(coveredEdges(900, [card]), { top: 0, bottom: 0 });
  assert.deepEqual(coveredEdges(900, [card], 40), { top: 0, bottom: 195 });
  assert.deepEqual(coveredEdges(900, [{ top: 200, bottom: 300 }], 40), { top: 0, bottom: 0 }, 'still not mid-screen');
});

/* ── an empty box around drawn content ──────────────────────────────────── */

test('an empty inline link is as big as the swatch it holds', () => {
  const { unionRect } = globalThis.TuiViewRules;
  const own = r(750, 403, 0, 0);
  assert.deepEqual(
    [unionRect(own, [r(752, 405, 17, 17)]).width, unionRect(own, [r(752, 405, 17, 17)]).top],
    [17, 405]);
});

test('several children make one box around all of them', () => {
  const { unionRect } = globalThis.TuiViewRules;
  const u = unionRect(r(0, 0, 0, 0), [r(10, 10, 20, 20), r(40, 5, 10, 10)]);
  assert.deepEqual([u.left, u.top, u.right, u.bottom], [10, 5, 50, 30]);
});

test('children with no area leave the element as it was', () => {
  const { unionRect } = globalThis.TuiViewRules;
  const own = r(5, 5, 0, 0);
  assert.equal(unionRect(own, [r(1, 1, 0, 0)]), own);
  assert.equal(unionRect(own, []), own);
});
