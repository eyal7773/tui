/**
 * Geometry for Home and End, and for scoring a single arrow step.
 *
 * The last arrow pressed picks an axis. End then means "the furthest thing that
 * way on this line", and Home means the same in the opposite direction. On the
 * horizontal axis a line is a row, on the vertical axis it is a column.
 *
 * Pure: rectangles in, decisions out. No DOM, so every case can be tested
 * against exact coordinates rather than a real page.
 */
(function (root) {
  'use strict';

  const HORIZONTAL = 'horizontal';
  const VERTICAL = 'vertical';

  const AXIS_OF = {
    ArrowLeft: HORIZONTAL,
    ArrowRight: HORIZONTAL,
    ArrowUp: VERTICAL,
    ArrowDown: VERTICAL
  };

  // End travels this way; Home travels the other.
  const END_DIRECTION = { [HORIZONTAL]: 'ArrowRight', [VERTICAL]: 'ArrowDown' };
  const HOME_DIRECTION = { [HORIZONTAL]: 'ArrowLeft', [VERTICAL]: 'ArrowUp' };

  /**
   * How much of the shorter element has to sit inside the line before it counts
   * as being on it. Without a floor, a tall sidebar that clips a row by one
   * pixel would be "on that row", and End would jump sideways out of the list
   * the user is reading.
   */
  const MIN_OVERLAP_RATIO = 0.5;

  /** Matches the slack the engine's own direction cone uses. */
  const FORWARD_SLACK = 5;

  function axisOf(direction) {
    return AXIS_OF[direction] || null;
  }

  /**
   * @param {string} key 'Home' or 'End'
   * @param {string} lastDirection the last arrow that moved the ring
   * @returns {string|null} the arrow direction to travel in
   */
  function directionFor(key, lastDirection) {
    const axis = axisOf(lastDirection) || HORIZONTAL;
    if (key === 'End') return END_DIRECTION[axis];
    if (key === 'Home') return HOME_DIRECTION[axis];
    return null;
  }

  function span(rect, axis) {
    // The line runs along `axis`, so membership is decided on the other one.
    return axis === HORIZONTAL
      ? { start: rect.top, end: rect.bottom }
      : { start: rect.left, end: rect.right };
  }

  /** Is `rect` on the same line as `current`, for movement along `axis`? */
  function sameLine(current, rect, axis) {
    if (!current || !rect || !axis) return false;

    const a = span(current, axis);
    const b = span(rect, axis);

    const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
    if (overlap <= 0) return false;

    const shorter = Math.min(a.end - a.start, b.end - b.start);
    if (shorter <= 0) return true;   // degenerate; any overlap is all of it

    return overlap >= shorter * MIN_OVERLAP_RATIO;
  }

  /** Is `rect` ahead of `current` in `direction`? Mirrors the engine's cone. */
  function isForward(current, rect, direction) {
    if (!current || !rect) return false;

    switch (direction) {
      case 'ArrowRight': return rect.left >= current.right - FORWARD_SLACK;
      case 'ArrowLeft': return rect.right <= current.left + FORWARD_SLACK;
      case 'ArrowDown': return rect.top >= current.bottom - FORWARD_SLACK;
      case 'ArrowUp': return rect.bottom <= current.top + FORWARD_SLACK;
      default: return false;
    }
  }

  /**
   * How far along `direction` a rectangle sits. Larger is further away, so the
   * engine can keep picking the lowest score and still land on the extreme by
   * negating this.
   */
  function reach(rect, direction) {
    switch (direction) {
      case 'ArrowRight': return rect.left;
      case 'ArrowLeft': return -rect.right;
      case 'ArrowDown': return rect.top;
      case 'ArrowUp': return -rect.bottom;
      default: return 0;
    }
  }

  /** The tie-break, for two rectangles that start at the same place. */
  function extent(rect, direction) {
    switch (direction) {
      case 'ArrowRight': return rect.right;
      case 'ArrowLeft': return -rect.left;
      case 'ArrowDown': return rect.bottom;
      case 'ArrowUp': return -rect.top;
      default: return 0;
    }
  }

  /**
   * How far off the current line `rect` sits, across the direction of travel.
   *
   * Zero only when it is on the same line. A row that merely touches, or clips
   * the current one by a sliver, is the next line over and scores at least 1.
   * Grids are laid out edge to edge, so the row above ends exactly where the
   * current row starts: counting that as "aligned" tied it with the neighbour
   * on the same row, and whichever came first in the DOM won.
   */
  function crossGap(current, rect, axis) {
    if (sameLine(current, rect, axis)) return 0;

    const a = span(current, axis);
    const b = span(rect, axis);
    const separation = Math.max(b.start - a.end, a.start - b.end);
    return Math.max(separation, 1);
  }

  /**
   * Score for a single arrow step: lower is better. Distance along the
   * direction, plus a penalty for leaving the line. Leaving the line costs far
   * more sideways than up and down, because rows are short and a sideways step
   * that changes row is almost never what was meant.
   */
  // What each pixel of leaving the column costs on an up/down step. It was
  // 1.5, and on Fox News a bullet link in the next column, 61px down and 78px
  // across, beat the next story straight below, 196px down: ArrowDown hopped
  // columns in the middle of a list. News grids leave that much air between
  // stories, so staying in the column has to be worth more than that.
  const COLUMN_PENALTY = 3;

  function stepScore(current, rect, direction) {
    switch (direction) {
      case 'ArrowUp':
        return (current.top - rect.bottom) + crossGap(current, rect, VERTICAL) * COLUMN_PENALTY;
      case 'ArrowDown':
        return (rect.top - current.bottom) + crossGap(current, rect, VERTICAL) * COLUMN_PENALTY;
      case 'ArrowLeft':
        return (current.left - rect.right) + crossGap(current, rect, HORIZONTAL) * 30;
      case 'ArrowRight':
        return (rect.left - current.right) + crossGap(current, rect, HORIZONTAL) * 30;
      default:
        return Infinity;
    }
  }

  /** True when `rect` qualifies as a target for a Home/End jump. */
  function isLineCandidate(current, rect, direction) {
    const axis = axisOf(direction);
    if (!axis) return false;
    return isForward(current, rect, direction) && sameLine(current, rect, axis);
  }

  /**
   * @returns {number} index of the furthest qualifying rectangle, or -1 when
   *   nothing qualifies, which is the signal to stay put.
   */
  function findLineExtreme(current, rects, direction) {
    if (!current || !Array.isArray(rects) || !axisOf(direction)) return -1;

    let best = -1;
    let bestReach = -Infinity;
    let bestExtent = -Infinity;

    rects.forEach((rect, index) => {
      if (!rect || !isLineCandidate(current, rect, direction)) return;

      const r = reach(rect, direction);
      const e = extent(rect, direction);

      if (r > bestReach || (r === bestReach && e > bestExtent)) {
        best = index;
        bestReach = r;
        bestExtent = e;
      }
    });

    return best;
  }

  root.TuiLineRules = {
    axisOf,
    directionFor,
    sameLine,
    isForward,
    isLineCandidate,
    findLineExtreme,
    crossGap,
    stepScore,
    reach,
    HORIZONTAL,
    VERTICAL,
    MIN_OVERLAP_RATIO,
    FORWARD_SLACK,
    DEFAULT_DIRECTION: 'ArrowRight'
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
