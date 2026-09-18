/**
 * Tests for the Home/End geometry.
 *
 * This is where the subtle bugs live: which elements count as being "on the
 * same line" is a judgement call about overlapping rectangles, and getting it
 * slightly wrong means End quietly jumps out of the list you were reading.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

require('../src/line-rules.js');
const {
  axisOf, directionFor, sameLine, isForward, isLineCandidate, findLineExtreme,
  crossGap, stepScore,
  HORIZONTAL, VERTICAL, MIN_OVERLAP_RATIO
} = globalThis.TuiLineRules;

/** left, top, width, height -> the corners the rules read. */
function r(left, top, width, height) {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

/* ── axis and direction ─────────────────────────────────────────────────── */

test('the last arrow decides the axis', () => {
  assert.equal(axisOf('ArrowLeft'), HORIZONTAL);
  assert.equal(axisOf('ArrowRight'), HORIZONTAL);
  assert.equal(axisOf('ArrowUp'), VERTICAL);
  assert.equal(axisOf('ArrowDown'), VERTICAL);
  assert.equal(axisOf('Enter'), null);
  assert.equal(axisOf(undefined), null);
});

test('End and Home travel opposite ways along that axis', () => {
  assert.equal(directionFor('End', 'ArrowRight'), 'ArrowRight');
  assert.equal(directionFor('End', 'ArrowLeft'), 'ArrowRight', 'End is always the far end');
  assert.equal(directionFor('Home', 'ArrowRight'), 'ArrowLeft');
  assert.equal(directionFor('Home', 'ArrowLeft'), 'ArrowLeft');

  assert.equal(directionFor('End', 'ArrowDown'), 'ArrowDown');
  assert.equal(directionFor('End', 'ArrowUp'), 'ArrowDown');
  assert.equal(directionFor('Home', 'ArrowDown'), 'ArrowUp');
  assert.equal(directionFor('Home', 'ArrowUp'), 'ArrowUp');
});

test('with no arrow pressed yet the axis is horizontal', () => {
  assert.equal(directionFor('End', null), 'ArrowRight');
  assert.equal(directionFor('End', undefined), 'ArrowRight');
  assert.equal(directionFor('Home', 'nonsense'), 'ArrowLeft');
});

test('directionFor ignores keys that are not Home or End', () => {
  assert.equal(directionFor('PageDown', 'ArrowRight'), null);
  assert.equal(directionFor('', 'ArrowRight'), null);
});

/* ── what counts as the same line ───────────────────────────────────────── */

test('a row is decided by vertical overlap', () => {
  const current = r(0, 100, 80, 40);              // top 100, bottom 140

  assert.equal(sameLine(current, r(200, 100, 80, 40), HORIZONTAL), true, 'aligned');
  assert.equal(sameLine(current, r(200, 110, 80, 40), HORIZONTAL), true, 'mostly overlapping');
  assert.equal(sameLine(current, r(200, 300, 80, 40), HORIZONTAL), false, 'a different row');
  assert.equal(sameLine(current, r(200, 140, 80, 40), HORIZONTAL), false, 'touching, not overlapping');
});

test('a column is decided by horizontal overlap', () => {
  const current = r(100, 0, 40, 80);

  assert.equal(sameLine(current, r(100, 200, 40, 80), VERTICAL), true);
  assert.equal(sameLine(current, r(110, 200, 40, 80), VERTICAL), true);
  assert.equal(sameLine(current, r(400, 200, 40, 80), VERTICAL), false);
});

test('a sliver of overlap is not enough to join a line', () => {
  // The case the ratio exists for: a tall sidebar clipping a row by a few
  // pixels must not count, or End would leave the list being read.
  const row = r(0, 100, 80, 40);                  // 40 tall
  const tallSidebar = r(300, 135, 60, 400);       // overlaps by 5px only

  assert.equal(sameLine(row, tallSidebar, HORIZONTAL), false, '5 of 40 is not a row');

  // Exactly at the threshold: 20 of 40.
  assert.equal(sameLine(row, r(300, 120, 60, 400), HORIZONTAL), true, '20 of 40 qualifies');
  // Just under it.
  assert.equal(sameLine(row, r(300, 121, 60, 400), HORIZONTAL), false, '19 of 40 does not');
});

test('the ratio is measured against the shorter element', () => {
  // A short chip beside a tall card: the chip is fully inside the card's band,
  // so it is on the row even though it covers little of the card.
  const tallCard = r(0, 100, 200, 200);
  const shortChip = r(300, 180, 60, 20);

  assert.equal(sameLine(tallCard, shortChip, HORIZONTAL), true,
    'the chip is wholly within the row');
  assert.equal(MIN_OVERLAP_RATIO, 0.5, 'the documented threshold');
});

test('sameLine copes with missing input', () => {
  const a = r(0, 0, 10, 10);
  assert.equal(sameLine(null, a, HORIZONTAL), false);
  assert.equal(sameLine(a, null, HORIZONTAL), false);
  assert.equal(sameLine(a, a, null), false);
});

/* ── direction ──────────────────────────────────────────────────────────── */

test('isForward matches the cone the arrows already use', () => {
  const current = r(100, 100, 50, 50);            // right 150, bottom 150

  assert.equal(isForward(current, r(200, 100, 50, 50), 'ArrowRight'), true);
  assert.equal(isForward(current, r(0, 100, 50, 50), 'ArrowRight'), false);
  assert.equal(isForward(current, r(0, 100, 50, 50), 'ArrowLeft'), true);
  assert.equal(isForward(current, r(100, 200, 50, 50), 'ArrowDown'), true);
  assert.equal(isForward(current, r(100, 0, 50, 50), 'ArrowUp'), true);
  assert.equal(isForward(current, r(100, 0, 50, 50), 'ArrowDown'), false);
  assert.equal(isForward(current, r(200, 100, 50, 50), 'Enter'), false);
});

/* ── picking the extreme ────────────────────────────────────────────────── */

test('End on a row lands on the furthest element, not the next one', () => {
  const current = r(0, 100, 80, 40);
  const rects = [
    r(100, 100, 80, 40),     // 0 next along
    r(400, 100, 80, 40),     // 1 furthest
    r(250, 100, 80, 40),     // 2 middle
    r(400, 500, 80, 40)      // 3 furthest, but a different row
  ];

  assert.equal(findLineExtreme(current, rects, 'ArrowRight'), 1);
});

test('Home on a row lands on the leftmost', () => {
  const current = r(400, 100, 80, 40);
  const rects = [
    r(250, 100, 80, 40),     // 0
    r(0, 100, 80, 40),       // 1 leftmost
    r(120, 100, 80, 40),     // 2
    r(0, 500, 80, 40)        // 3 leftmost, wrong row
  ];

  assert.equal(findLineExtreme(current, rects, 'ArrowLeft'), 1);
});

test('End on a column lands on the lowest element in that column', () => {
  const current = r(100, 0, 60, 30);
  const rects = [
    r(100, 100, 60, 30),     // 0
    r(100, 600, 60, 30),     // 1 lowest in the column
    r(900, 800, 60, 30),     // 2 lower still, different column
    r(100, 300, 60, 30)      // 3
  ];

  assert.equal(findLineExtreme(current, rects, 'ArrowDown'), 1);
});

test('Home on a column lands on the highest', () => {
  const current = r(100, 600, 60, 30);
  const rects = [
    r(100, 300, 60, 30),
    r(100, 20, 60, 30),      // 1 highest
    r(900, 0, 60, 30)        // different column
  ];

  assert.equal(findLineExtreme(current, rects, 'ArrowUp'), 1);
});

test('already at the end means stay put', () => {
  const current = r(400, 100, 80, 40);
  const rects = [
    r(0, 100, 80, 40),       // behind us
    r(200, 100, 80, 40)      // also behind us
  ];

  assert.equal(findLineExtreme(current, rects, 'ArrowRight'), -1);
});

test('nothing on the line means stay put', () => {
  const current = r(0, 100, 80, 40);
  const rects = [
    r(400, 500, 80, 40),     // forward, wrong row
    r(400, 900, 80, 40)
  ];

  assert.equal(findLineExtreme(current, rects, 'ArrowRight'), -1);
});

test('two elements starting together are split by which reaches further', () => {
  const current = r(0, 100, 40, 40);
  const rects = [
    r(300, 100, 40, 40),     // 0 narrow
    r(300, 100, 120, 40)     // 1 same start, reaches further right
  ];

  assert.equal(findLineExtreme(current, rects, 'ArrowRight'), 1);
});

test('findLineExtreme is safe with junk input', () => {
  const current = r(0, 0, 10, 10);
  assert.equal(findLineExtreme(null, [current], 'ArrowRight'), -1);
  assert.equal(findLineExtreme(current, null, 'ArrowRight'), -1);
  assert.equal(findLineExtreme(current, [], 'ArrowRight'), -1);
  assert.equal(findLineExtreme(current, [null, undefined], 'ArrowRight'), -1);
  assert.equal(findLineExtreme(current, [r(50, 0, 10, 10)], 'Enter'), -1);
});

test('isLineCandidate needs both halves to hold', () => {
  const current = r(0, 100, 80, 40);

  assert.equal(isLineCandidate(current, r(300, 100, 80, 40), 'ArrowRight'), true);
  assert.equal(isLineCandidate(current, r(300, 900, 80, 40), 'ArrowRight'), false, 'wrong line');
  assert.equal(isLineCandidate(current, r(-300, 100, 80, 40), 'ArrowRight'), false, 'wrong way');
});

/* ── a realistic layout ─────────────────────────────────────────────────── */

test('a toolbar above a grid behaves the way it looks', () => {
  // Toolbar across the top, then a three-by-two grid underneath.
  const toolbar = [r(20, 20, 60, 30), r(100, 20, 60, 30), r(180, 20, 60, 30)];
  const gridRow1 = [r(20, 100, 200, 80), r(240, 100, 200, 80), r(460, 100, 200, 80)];
  const gridRow2 = [r(20, 200, 200, 80), r(240, 200, 200, 80), r(460, 200, 200, 80)];
  const all = [...toolbar, ...gridRow1, ...gridRow2];

  // From the first grid cell, End goes to the end of that grid row only.
  assert.equal(findLineExtreme(gridRow1[0], all, 'ArrowRight'), all.indexOf(gridRow1[2]));

  // From the first grid cell, End on the vertical axis goes down its column.
  assert.equal(findLineExtreme(gridRow1[0], all, 'ArrowDown'), all.indexOf(gridRow2[0]));

  // From a toolbar button, End stays in the toolbar and never drops into the grid.
  assert.equal(findLineExtreme(toolbar[0], all, 'ArrowRight'), all.indexOf(toolbar[2]));
});

/* ── scoring a single arrow step ────────────────────────────────────────── */

/** The candidate with the lowest step score, as the engine picks it. */
function pick(current, rects, direction) {
  let best = -1;
  let bestScore = Infinity;
  rects.forEach((rect, index) => {
    const score = stepScore(current, rect, direction);
    if (score < bestScore) { best = index; bestScore = score; }
  });
  return best;
}

test('a row that only touches the current one is not on it', () => {
  const current = r(0, 100, 80, 60);               // top 100, bottom 160

  assert.equal(crossGap(current, r(200, 100, 80, 60), HORIZONTAL), 0, 'same row');
  assert.equal(crossGap(current, r(200, 40, 80, 60), HORIZONTAL), 1, 'row above, edge to edge');
  assert.equal(crossGap(current, r(200, 160, 80, 60), HORIZONTAL), 1, 'row below, edge to edge');
  assert.equal(crossGap(current, r(200, 0, 80, 60), HORIZONTAL), 40, 'a real gap is kept');
});

test('ArrowLeft in an edge-to-edge grid stays on the row (Google related searches, RTL)', () => {
  // Exact rectangles from the bug report: two columns of chips with no gap
  // between rows. From "Google website", ArrowLeft went to "Google wrapped"
  // on the row above, because touching scored the same as aligned and it
  // came first in the DOM. The chip beside it is "Download google".
  const website = { left: 1365, right: 1659, top: 1893.625, bottom: 1953.625 };
  const left = [
    { left: 1031, right: 1325, top: 1713.625, bottom: 1773.625 },   // Google News
    { left: 1031, right: 1325, top: 1773.625, bottom: 1833.625 },   // Google Maps
    { left: 1031, right: 1325, top: 1833.625, bottom: 1893.625 },   // Google wrapped
    { left: 1031, right: 1325, top: 1893.625, bottom: 1953.625 }    // Download google
  ];

  assert.equal(pick(website, left, 'ArrowLeft'), 3);
});

test('the same holds in every direction', () => {
  const current = r(100, 100, 100, 50);

  // Right: the neighbour on the row beats the one diagonally below it.
  assert.equal(pick(current, [r(200, 150, 100, 50), r(200, 100, 100, 50)], 'ArrowRight'), 1);

  // Down and up: the one straight below/above beats the diagonal that touches the column.
  assert.equal(pick(current, [r(200, 150, 100, 50), r(100, 150, 100, 50)], 'ArrowDown'), 1);
  assert.equal(pick(current, [r(0, 50, 100, 50), r(100, 50, 100, 50)], 'ArrowUp'), 1);
});

test('a nearer element on the row still wins over a further one', () => {
  const current = r(300, 100, 80, 40);
  assert.equal(pick(current, [r(0, 100, 80, 40), r(150, 100, 80, 40)], 'ArrowLeft'), 1);
});

test('stepScore rejects unknown directions', () => {
  assert.equal(stepScore(r(0, 0, 10, 10), r(20, 0, 10, 10), 'Enter'), Infinity);
});
