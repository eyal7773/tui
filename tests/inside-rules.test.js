/**
 * Tests for going into an item and out of it.
 *
 *   npm test
 *
 * Ctrl+ArrowDown and Ctrl+ArrowUp take over keys that were plain arrows, so
 * anything else held with them must leave them alone; and the hint must show
 * where it helps without following the ring round every card.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

require('../src/inside-rules.js');
const { insideMove, cameBack, shouldHint, MIN_STOPS_FOR_HINT, BACK_WITHIN } = globalThis.TuiInsideRules;

test('Ctrl+ArrowDown goes in and Ctrl+ArrowUp out; nothing else does', () => {
  assert.equal(insideMove({ key: 'ArrowDown', ctrlKey: true }), 'in');
  assert.equal(insideMove({ key: 'ArrowUp', ctrlKey: true }), 'out');
  // The sideways ones stay plain arrows.
  assert.equal(insideMove({ key: 'ArrowLeft', ctrlKey: true }), null);
  assert.equal(insideMove({ key: 'ArrowRight', ctrlKey: true }), null);
  assert.equal(insideMove({ key: 'ArrowDown' }), null);
  assert.equal(insideMove({ key: 'ArrowDown', ctrlKey: true, shiftKey: true }), null);
  assert.equal(insideMove({ key: 'ArrowUp', ctrlKey: true, altKey: true }), null);
  assert.equal(insideMove({ key: 'ArrowUp', ctrlKey: true, metaKey: true }), null);
  assert.equal(insideMove(null), null);
});

test('coming back to an item within a few presses is told from passing it', () => {
  const tree = {}, code = {}, line = {}, other = {};
  // To the code and back up to the tree: came back.
  assert.equal(cameBack([tree, code], tree), true);
  assert.equal(cameBack([tree, code, line], tree), true);
  // Too long ago.
  assert.equal(cameBack([tree, code, line, other], tree), false);
  assert.equal(BACK_WITHIN, 3);
  // Still on it, or never there.
  assert.equal(cameBack([code, tree], tree), false);
  assert.equal(cameBack([code, line], tree), false);
  assert.equal(cameBack([], tree), false);
});

test('the hint shows on an item with stops inside, once, and again on coming back', () => {
  assert.equal(MIN_STOPS_FOR_HINT, 2);
  assert.equal(shouldHint(3, false, false), true);
  assert.equal(shouldHint(3, true, false), false);
  assert.equal(shouldHint(3, true, true), true);
  // A wrapper round one control is no place to go into.
  assert.equal(shouldHint(1, false, true), false);
  assert.equal(shouldHint(0, false, false), false);
});
