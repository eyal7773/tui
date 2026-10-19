/**
 * Going into an item and back out of it: Ctrl+ArrowDown steps from the item
 * in the ring to the first stop inside it, Ctrl+ArrowUp from the item in the
 * ring out to the stop around it. A folder in a file tree, an open message,
 * a card with buttons: the plain arrows step past such an item as a whole,
 * and these keys are the way in, whatever its shape. With nowhere to go they
 * are plain arrows, as they were before.
 *
 * A hint shows the way in when the ring lands on an item with stops inside
 * (see shouldHint).
 *
 * This file only decides; the engine finds the stops, so the decisions can
 * be tested without a page.
 */
(function (root) {
  'use strict';

  /**
   * 'in' for Ctrl+ArrowDown, 'out' for Ctrl+ArrowUp, null for any other
   * key. Shift, Alt or Meta with them is something else.
   */
  function insideMove(e) {
    if (!e || !e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return null;
    if (e.key === 'ArrowDown') return 'in';
    if (e.key === 'ArrowUp') return 'out';
    return null;
  }

  /**
   * Stops inside an item before the hint shows on it. One alone is most
   * often a wrapper round a single control, a label round its checkbox,
   * which is no place to go into: Enter reaches it.
   */
  const MIN_STOPS_FOR_HINT = 2;

  /** How many arrivals back a return to the same item counts as coming back. */
  const BACK_WITHIN = 3;

  /**
   * Whether the ring, arriving at el, left it and came back within
   * BACK_WITHIN presses: the sign that the user wanted to get inside it and
   * the arrows took them past. trail is where the ring arrived before this,
   * the latest last.
   */
  function cameBack(trail, el) {
    if (!trail || !trail.length || trail[trail.length - 1] === el) return false;
    return trail.slice(-BACK_WITHIN).includes(el);
  }

  /**
   * Whether the hint shows on an item the arrows brought the ring to: one
   * with stops inside, the first time on it, or again when the user came
   * back to it.
   */
  function shouldHint(stops, hintedBefore, back) {
    return stops >= MIN_STOPS_FOR_HINT && (!hintedBefore || !!back);
  }

  root.TuiInsideRules = {
    insideMove: insideMove,
    MIN_STOPS_FOR_HINT: MIN_STOPS_FOR_HINT,
    BACK_WITHIN: BACK_WITHIN,
    cameBack: cameBack,
    shouldHint: shouldHint
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
