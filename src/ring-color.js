/**
 * Colour handling for the focus ring.
 *
 * Shared by the engine and the popup so the swatch you pick and the ring you
 * get are computed by the same code. Pure: no DOM, no Chrome APIs.
 *
 * A malformed colour matters more than it looks. CSS drops a declaration it
 * cannot parse, and the ring would quietly become invisible rather than fail
 * loudly, so every entry point here returns null instead of a partial string.
 */
(function (root) {
  'use strict';

  const DEFAULT = '#00ff00';
  const WASH_ALPHA = 0.1;

  // Chosen so that something stays distinguishable when green does not work:
  // red-green colour blindness leaves blue, orange and yellow intact.
  const PRESETS = [
    { hex: '#00ff00', name: 'Green' },
    { hex: '#00b4ff', name: 'Blue' },
    { hex: '#ff8a00', name: 'Orange' },
    { hex: '#ffe600', name: 'Yellow' },
    { hex: '#ff00d4', name: 'Magenta' },
    { hex: '#ff3b3b', name: 'Red' }
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

  /**
   * The two custom properties the ring is drawn from. Falls back to the default
   * colour rather than returning nothing, so a corrupted stored value can never
   * leave the ring unpainted.
   */
  function ringVariables(input) {
    const hex = normalizeHex(input) || DEFAULT;
    return {
      '--tui-ring': hex,
      '--tui-ring-wash': toRgba(hex, WASH_ALPHA)
    };
  }

  root.TuiRingColor = {
    normalizeHex,
    toRgb,
    toRgba,
    ringVariables,
    DEFAULT,
    WASH_ALPHA,
    PRESETS,
    STORAGE_KEY: 'tuiRingColor'
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
