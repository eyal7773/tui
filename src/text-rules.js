/**
 * Text mode: the arrows move a caret through the page's text instead of the
 * ring between controls, so a passage can be selected and copied from the
 * keyboard alone.
 *
 * Shift+ArrowLeft or Shift+ArrowRight starts it, from the text under the
 * ring; Shift+ArrowUp and Shift+ArrowDown scroll (see scrollStep). The keys
 * are an editor's: arrows by character and line, Ctrl by word and paragraph,
 * Home/End to the ends of the line, Shift to extend. For anyone who cannot
 * hold two keys, Enter drops an anchor so plain arrows extend, and Enter
 * again copies what is selected. Escape leaves.
 *
 * This file only decides what a key means. The caret is moved with
 * Selection.modify, whose (alter, direction, granularity) this returns, so
 * the decisions can be tested without a page.
 */
(function (root) {
  'use strict';

  // left/right follow the screen, not the text order, so on a Hebrew page
  // ArrowLeft still goes left.
  const MOVES = {
    ArrowLeft: { direction: 'left', granularity: 'character', ctrl: 'word' },
    ArrowRight: { direction: 'right', granularity: 'character', ctrl: 'word' },
    ArrowUp: { direction: 'backward', granularity: 'line', ctrl: 'paragraph' },
    ArrowDown: { direction: 'forward', granularity: 'line', ctrl: 'paragraph' },
    Home: { direction: 'backward', granularity: 'lineboundary', ctrl: 'documentboundary' },
    End: { direction: 'forward', granularity: 'lineboundary', ctrl: 'documentboundary' }
  };

  const SIDEWAYS = new Set(['ArrowLeft', 'ArrowRight']);

  const onlyShift = (e) => !!e && !!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;

  /** Whether a key in the ring's mode starts text mode: Shift and a sideways arrow, nothing else. */
  function startsTextMode(e) {
    return onlyShift(e) && SIDEWAYS.has(e.key);
  }

  /**
   * How far one press scrolls: the browser's own step for an arrow key, so
   * holding it down scrolls on as the browser does.
   */
  const SCROLL_STEP_PX = 40;

  /**
   * Shift+ArrowUp and Shift+ArrowDown in the ring's mode scroll, without
   * moving the ring: pixels to scroll by, up negative, or 0 for any other
   * key. They used to start text mode as the sideways ones do, which left a
   * keyboard user no way to scroll a page with nothing to step to.
   */
  function scrollStep(e) {
    if (!onlyShift(e)) return 0;
    if (e.key === 'ArrowDown') return SCROLL_STEP_PX;
    if (e.key === 'ArrowUp') return -SCROLL_STEP_PX;
    return 0;
  }

  /**
   * What a key does in text mode.
   *   { type: 'move', alter: 'move'|'extend', direction, granularity }
   *   { type: 'mark' }   Enter: drop the anchor, or copy what is selected
   *   { type: 'exit' }   Escape
   *   { type: 'leave' }  Tab: leave, and the page moves focus as usual
   *   null               not ours; the page gets it (Ctrl+C among them)
   * marking is true while an anchor dropped with Enter is down: every move
   * extends from it, as if Shift were held.
   */
  function textAction(e, marking) {
    if (!e || e.altKey || e.metaKey) return null;
    if (e.key === 'Escape') return { type: 'exit' };
    if (e.key === 'Tab') return { type: 'leave' };
    if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) return { type: 'mark' };

    const move = MOVES[e.key];
    if (!move) return null;
    return {
      type: 'move',
      alter: e.shiftKey || marking ? 'extend' : 'move',
      direction: move.direction,
      granularity: e.ctrlKey ? move.ctrl : move.granularity
    };
  }

  // Text that is not the page's prose: code the browser never draws, and
  // the text inside form fields, which select on their own.
  const SKIPPED_PARENTS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'OPTION', 'SELECT']);

  /** Whether a text node is one the caret can start in, by its content and parent alone. */
  function isReadableText(node) {
    if (!node || typeof node.nodeValue !== 'string' || !/\S/.test(node.nodeValue)) return false;
    const parent = node.parentElement;
    if (!parent) return false;
    if (SKIPPED_PARENTS.has(String(parent.tagName).toUpperCase())) return false;
    // The extension's own ring, caret, badge and notes.
    const id = parent.id || '';
    return !/^tui-/.test(id);
  }

  /** Where the first character that is not white space sits in a text node. */
  function firstCharOffset(node) {
    const match = /\S/.exec((node && node.nodeValue) || '');
    return match ? match.index : 0;
  }

  root.TuiTextRules = {
    startsTextMode: startsTextMode,
    scrollStep: scrollStep,
    SCROLL_STEP_PX: SCROLL_STEP_PX,
    textAction: textAction,
    isReadableText: isReadableText,
    firstCharOffset: firstCharOffset
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
