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

  /**
   * An overlay taller than this share of the window is a dialog or a page of
   * its own, not a bar along an edge: reserving room for it would leave no
   * room at all. The Guardian's support banner takes 45%.
   */
  const MAX_EDGE_OVERLAY_RATIO = 0.6;

  /**
   * How much of the window's top and bottom edges fixed bars cover, given the
   * rectangles of the fixed or sticky elements found along those edges.
   *
   * Scrolling a target "into view" only brought it inside the window, so on
   * The Guardian the story the ring had just moved to sat half behind the
   * sticky support banner along the bottom, and on sites with a pinned header
   * a step up hid the target under it.
   *
   * @param {number} viewportHeight
   * @param {Array<{top:number,bottom:number}>} overlays
   * @returns {{top:number,bottom:number}} pixels covered from each edge
   */
  function coveredEdges(viewportHeight, overlays) {
    const covered = { top: 0, bottom: 0 };
    if (typeof viewportHeight !== 'number' || !Array.isArray(overlays)) return covered;

    const maxHeight = viewportHeight * MAX_EDGE_OVERLAY_RATIO;
    const EDGE = 2;   // a bar may stop a pixel short of the edge

    overlays.forEach((rect) => {
      if (!rect) return;
      const height = rect.bottom - rect.top;
      if (!(height > 0) || height > maxHeight) return;

      const onTop = rect.top <= EDGE && rect.bottom > 0;
      const onBottom = rect.bottom >= viewportHeight - EDGE && rect.top < viewportHeight;
      if (onTop && !onBottom) covered.top = Math.max(covered.top, rect.bottom);
      if (onBottom && !onTop) covered.bottom = Math.max(covered.bottom, viewportHeight - rect.top);
    });

    return covered;
  }

  /**
   * The box an element is drawn in, when its own box is empty.
   *
   * An inline link wrapped around block content measures 0x0 where the line
   * would have been, while its content is drawn below it: Amazon's colour
   * swatches are <a> elements around 17px squares, and the size filter threw
   * every one away. Such an element is as big as what it holds.
   *
   * @param {{left:number,top:number,right:number,bottom:number}} own
   * @param {Array<{left:number,top:number,right:number,bottom:number}>} parts
   *   the rectangles of its children
   * @returns the union of the parts that have any area, or own when none do
   */
  function unionRect(own, parts) {
    const drawn = (parts || []).filter(p => p && p.right - p.left > 0 && p.bottom - p.top > 0);
    if (!drawn.length) return own;
    const left = Math.min(...drawn.map(p => p.left));
    const top = Math.min(...drawn.map(p => p.top));
    const right = Math.max(...drawn.map(p => p.right));
    const bottom = Math.max(...drawn.map(p => p.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top };
  }

  root.TuiViewRules = {
    unionRect,
    withinReach,
    onScreen,
    coveredEdges,
    MAX_EDGE_OVERLAY_RATIO,
    bandFor,
    VERTICAL_REACH_RATIO
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
