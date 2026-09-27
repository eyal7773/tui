/**
 * Tests for text mode's keys (text-rules.js).
 *
 *   npm test
 *
 * A wrong answer here moves the caret by the wrong step, or selects when the
 * user meant to move, so each key is pinned down.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

require('../src/text-rules.js');
const { startsTextMode, textAction, isReadableText, firstCharOffset } = globalThis.TuiTextRules;

const key = (k, mods = {}) => ({ key: k, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...mods });

test('Shift and an arrow start text mode; nothing else does', () => {
  assert.equal(startsTextMode(key('ArrowRight', { shiftKey: true })), true);
  assert.equal(startsTextMode(key('ArrowDown', { shiftKey: true })), true);
  assert.equal(startsTextMode(key('ArrowRight')), false);
  assert.equal(startsTextMode(key('ArrowRight', { shiftKey: true, ctrlKey: true })), false);
  assert.equal(startsTextMode(key('Home', { shiftKey: true })), false);
  assert.equal(startsTextMode(key('Enter', { shiftKey: true })), false);
});

test('the arrows move by character and line, with Ctrl by word and paragraph', () => {
  assert.deepEqual(textAction(key('ArrowRight'), false),
    { type: 'move', alter: 'move', direction: 'right', granularity: 'character' });
  assert.deepEqual(textAction(key('ArrowLeft', { ctrlKey: true }), false),
    { type: 'move', alter: 'move', direction: 'left', granularity: 'word' });
  assert.deepEqual(textAction(key('ArrowDown'), false),
    { type: 'move', alter: 'move', direction: 'forward', granularity: 'line' });
  assert.deepEqual(textAction(key('ArrowUp', { ctrlKey: true }), false),
    { type: 'move', alter: 'move', direction: 'backward', granularity: 'paragraph' });
  assert.deepEqual(textAction(key('End'), false),
    { type: 'move', alter: 'move', direction: 'forward', granularity: 'lineboundary' });
});

test('Shift extends, and so does every move while an anchor is down', () => {
  assert.equal(textAction(key('ArrowRight', { shiftKey: true }), false).alter, 'extend');
  assert.equal(textAction(key('ArrowRight'), true).alter, 'extend');
  assert.equal(textAction(key('Home'), true).alter, 'extend');
});

test('Enter marks, Escape leaves, and the rest belong to the page', () => {
  assert.deepEqual(textAction(key('Enter'), false), { type: 'mark' });
  assert.deepEqual(textAction(key('Escape'), true), { type: 'exit' });
  // Ctrl+C is the page's own copy, of the selection text mode made.
  assert.equal(textAction(key('c', { ctrlKey: true }), false), null);
  // Tab leaves, and still moves focus as it always does.
  assert.deepEqual(textAction(key('Tab'), false), { type: 'leave' });
  assert.deepEqual(textAction(key('Tab', { shiftKey: true }), true), { type: 'leave' });
  assert.equal(textAction(key('a'), false), null);
  assert.equal(textAction(key('ArrowRight', { altKey: true }), false), null);
});

test('the caret starts in prose, never in code, form fields or the extension itself', () => {
  const text = (value, tagName, id = '') => ({ nodeValue: value, parentElement: { tagName, id } });
  assert.equal(isReadableText(text('Hello', 'P')), true);
  assert.equal(isReadableText(text('   \n ', 'P')), false);
  assert.equal(isReadableText(text('var x = 1;', 'SCRIPT')), false);
  assert.equal(isReadableText(text('typed', 'TEXTAREA')), false);
  assert.equal(isReadableText(text('TEXT', 'SPAN', 'tui-text-badge')), false);
  assert.equal(isReadableText({ nodeValue: 'orphan', parentElement: null }), false);
});

test('it starts on the first character, past leading white space', () => {
  assert.equal(firstCharOffset({ nodeValue: '\n    Hello' }), 5);
  assert.equal(firstCharOffset({ nodeValue: 'Hi' }), 0);
});
