/**
 * Which rectangles are near enough to the screen to be worth navigating to.
 *
 * Candidates used to be clipped to the viewport exactly. That quietly changed
 * what an arrow key means near the fold: the next thing down the column the
 * user is reading is usually a few pixels past the bottom edge, so it was
 * dropped, while an unrelated item in a sidebar that happened to start slightly
 * higher survived and won. The ring left the column for no reason the layout
 * explains.
 *
 * So the band reaches past the top and bottom edges. Scoring is still nearest
 * first, so anything on screen keeps its priority; the margin only means a row
 * that is one scroll away can compete instead of being invisible to the engine,
 * and focusing it scrolls it into view.
 *
 * Sideways stays strict. The page scrolls vertically, so that is where "just
 * past the fold" happens; off-canvas drawers and parked menus sit off to the
 * side and should stay unreachable until the page brings them in.
 *
 * Pure: rectangles in, decisions out. No DOM, so every edge can be tested
 * against exact coordinates rather than a real page.
 */
(function (root) {
  'use strict';

  /**
   * How far past the top and bottom edges a rectangle may sit and still count,
   * as a fraction of the viewport's own height. Half a screen is enough to
   * reach the next result, headline or row in any normal layout, and far too
   * little to reach a footer from the middle of an article.
   */
  const VERTICAL_REACH_RATIO = 0.5;

  /** Accepts a window, or a plain {width, height} so the rules stay testable. */
  function viewportOf(view) {
    const source = view || (typeof window !== 'undefined' ? window : null);
    if (!source) return null;

    const width = typeof source.innerWidth === 'number' ? source.innerWidth : source.width;
    const height = typeof source.innerHeight === 'number' ? source.innerHeight : source.height;
    if (typeof width !== 'number' || typeof height !== 'number') return null;

    return { width, height };
  }

  /** The rectangle candidates have to touch, in viewport coordinates. */
  function bandFor(viewport, ratio) {
    if (!viewport) return null;
    const margin = viewport.height * (typeof ratio === 'number' ? ratio : VERTICAL_REACH_RATIO);
    return {
      top: -margin,
      bottom: viewport.height + margin,
      left: 0,
      right: viewport.width
    };
  }

  /**
   * @param {{top:number,bottom:number,left:number,right:number}} rect
   * @param {{width:number,height:number}} [viewport] defaults to the window
   * @returns {boolean} true when the rectangle is on screen or one short scroll
   *   away from it
   */
  function withinReach(rect, viewport, ratio) {
    if (!rect) return false;

    const band = bandFor(viewportOf(viewport), ratio);
    if (!band) return true;   // no window to measure against; do not filter

    if (rect.bottom < band.top || rect.top > band.bottom) return false;
    if (rect.right < band.left || rect.left > band.right) return false;

    return true;
  }

  /** True only for rectangles the user can actually see right now. */
  function onScreen(rect, viewport) {
    return withinReach(rect, viewport, 0);
  }

  root.TuiViewRules = {
    withinReach,
    onScreen,
    bandFor,
    VERTICAL_REACH_RATIO
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
