/**
 * How the focus ring looks and how it moves.
 *
 * Shared by the engine and the popup so the preview in Settings and the ring on
 * the page are computed by the same code. Pure: no DOM, no Chrome APIs, and the
 * media query result is passed in rather than read here.
 *
 * A malformed value matters more than it looks. CSS drops a declaration it
 * cannot parse, so a bad colour or width would leave the ring invisible rather
 * than fail loudly. Every entry point either returns null or falls back to a
 * value that definitely paints.
 */
(function (root) {
  'use strict';

  const DEFAULT_COLOR = '#00ff00';
  const WASH_ALPHA = 0.1;

  const DEFAULT_WIDTH = 3;
  const MIN_WIDTH = 1;
  const MAX_WIDTH = 8;

  // 'auto' follows the operating system. The other two override it.
  const MOTION_MODES = ['auto', 'smooth', 'instant'];
  const DEFAULT_MOTION = 'auto';
  const RING_TRANSITION = 'all 0.1s ease-out';

  /*
   * The bright terminal palette, which is where the default green already sits.
   * Two different things used to stop the others glowing like it:
   *
   *   #ff3b3b carried grey. Its lowest channel was 59 rather than 0, which
   *   desaturates the colour no matter how bright the red is.
   *
   *   #00b4ff and #ff8a00 were fully saturated but sat part way along an edge of
   *   the RGB cube, so each was a blend of two hues. The corners - cyan, yellow,
   *   magenta, and the primaries - are the pure hues, and purity is what reads
   *   as phosphor rather than paint.
   *
   * Orange is the deliberate exception, kept off a corner because there is no
   * corner for it. It earns its place anyway: red-green colour blindness leaves
   * blue, orange and yellow distinguishable when green is not, so trading it for
   * a tidier rule would cost more than it gains. #ff6a00 moves it away from the
   * brown end of the edge without pretending to be a corner.
   */
  const PRESETS = [
    { hex: '#00ff00', name: 'Green' },
    { hex: '#00ffff', name: 'Cyan' },
    { hex: '#ff6a00', name: 'Orange' },
    { hex: '#ffff00', name: 'Yellow' },
    { hex: '#ff00ff', name: 'Magenta' },
    { hex: '#ff0000', name: 'Red' }
  ];

  /** "#0F0" | "00ff00" | " #00FF00 " -> "#00ff00". Anything else -> null. */
  function normalizeHex(input) {
    if (typeof input !== 'string') return null;

    let value = input.trim().toLowerCase();
    if (value.startsWith('#')) value = value.slice(1);

    if (/^[0-9a-f]{3}$/.test(value)) {
      value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
    }

    if (!/^[0-9a-f]{6}$/.test(value)) return null;
    return '#' + value;
  }

  /** @returns {{r:number,g:number,b:number}|null} */
  function toRgb(input) {
    const hex = normalizeHex(input);
    if (!hex) return null;
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  }

  /** "#00ff00", 0.1 -> "rgba(0, 255, 0, 0.1)". Invalid input -> null. */
  function toRgba(input, alpha) {
    const rgb = toRgb(input);
    if (!rgb) return null;

    let a = typeof alpha === 'number' && Number.isFinite(alpha) ? alpha : 1;
    if (a < 0) a = 0;
    if (a > 1) a = 1;

    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
  }

  /** Whole pixels inside the offered range. Anything unusable -> null. */
  function normalizeWidth(input) {
    const value = typeof input === 'string' ? Number(input.trim()) : input;
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;

    const rounded = Math.round(value);
    if (rounded < MIN_WIDTH || rounded > MAX_WIDTH) return null;
    return rounded;
  }

  function normalizeMotion(input) {
    return MOTION_MODES.includes(input) ? input : null;
  }

  /**
   * The custom properties the ring is drawn from. Each one falls back to a
   * value that paints, because an unresolved property would leave the ring
   * unpainted rather than merely wrong.
   *
   * fill === false turns off the tinted interior and leaves only the outline,
   * which keeps the text underneath readable on dense pages.
   */
  function ringVariables(appearance) {
    const a = appearance || {};
    const hex = normalizeHex(a.color) || DEFAULT_COLOR;
    const width = normalizeWidth(a.width) || DEFAULT_WIDTH;
    const fill = a.fill !== false;

    return {
      '--tui-ring': hex,
      '--tui-ring-wash': fill ? toRgba(hex, WASH_ALPHA) : 'transparent',
      '--tui-ring-width': `${width}px`
    };
  }

  /**
   * @param {string} mode one of MOTION_MODES
   * @param {boolean} prefersReduced the result of the prefers-reduced-motion
   *   media query, passed in so this stays testable.
   * @returns {{behavior: string, transition: string}} behavior feeds
   *   scrollIntoView and scrollBy; transition is the ring's own movement.
   */
  function motionSettings(mode, prefersReduced) {
    const chosen = normalizeMotion(mode) || DEFAULT_MOTION;
    const animate = chosen === 'smooth' || (chosen === 'auto' && !prefersReduced);

    return {
      behavior: animate ? 'smooth' : 'instant',
      transition: animate ? RING_TRANSITION : 'none'
    };
  }

  root.TuiRingStyle = {
    normalizeHex,
    toRgb,
    toRgba,
    normalizeWidth,
    normalizeMotion,
    ringVariables,
    motionSettings,
    DEFAULT_COLOR,
    DEFAULT_WIDTH,
    DEFAULT_MOTION,
    MIN_WIDTH,
    MAX_WIDTH,
    WASH_ALPHA,
    MOTION_MODES,
    RING_TRANSITION,
    PRESETS,
    KEYS: {
      color: 'tuiRingColor',
      width: 'tuiRingWidth',
      fill: 'tuiRingFill',
      motion: 'tuiMotion'
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
