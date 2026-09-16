/**
 * Tests for the focus ring's appearance and motion.
 *
 * The failure that matters is silent: CSS discards a declaration it cannot
 * parse, so a half-valid colour or width does not throw, it just leaves the
 * ring invisible. Most cases below are really asking "can a bad value escape?".
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

require('../src/ring-style.js');
const {
  normalizeHex, toRgb, toRgba, normalizeWidth, normalizeMotion,
  ringVariables, motionSettings,
  DEFAULT_COLOR, DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH,
  WASH_ALPHA, MOTION_MODES, RING_TRANSITION, PRESETS
} = globalThis.TuiRingStyle;

/* ── colour ─────────────────────────────────────────────────────────────── */

test('normalizeHex accepts the shapes a person might type', () => {
  const cases = [
    ['#00ff00', '#00ff00'],
    ['00ff00', '#00ff00'],
    ['#00FF00', '#00ff00'],
    ['  #00FF00  ', '#00ff00'],
    ['#0f0', '#00ff00'],
    ['0F0', '#00ff00'],
    ['#abc', '#aabbcc'],
    ['#000000', '#000000'],
    ['#ffffff', '#ffffff']
  ];

  for (const [input, expected] of cases) {
    assert.equal(normalizeHex(input), expected, JSON.stringify(input));
  }
});

test('normalizeHex rejects anything CSS would choke on', () => {
  const rejected = [
    '', '   ', '#', '#0', '#00', '#0000', '#00000', '#0000000',
    '#gggggg', '#00ff0g', 'green', 'rgb(0,255,0)', '#00 ff00',
    null, undefined, 123, {}, [], true
  ];

  for (const input of rejected) {
    assert.equal(normalizeHex(input), null, JSON.stringify(input));
  }
});

test('a rejected colour never becomes a partial string', () => {
  // The dangerous bug would be "#00ff0" or "rgba(0, 255, NaN, 0.1)".
  for (const bad of ['#00ff0g', 'green', '#0000000']) {
    assert.equal(toRgb(bad), null);
    assert.equal(toRgba(bad, 0.1), null);
  }
});

test('toRgb reads the channels', () => {
  assert.deepEqual(toRgb('#00ff00'), { r: 0, g: 255, b: 0 });
  assert.deepEqual(toRgb('#000000'), { r: 0, g: 0, b: 0 });
  assert.deepEqual(toRgb('#ffffff'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(toRgb('#ff8a00'), { r: 255, g: 138, b: 0 });
  assert.deepEqual(toRgb('#0f0'), { r: 0, g: 255, b: 0 }, 'shorthand expands first');
});

test('toRgba builds a string CSS will accept', () => {
  assert.equal(toRgba('#00ff00', 0.1), 'rgba(0, 255, 0, 0.1)');
  assert.equal(toRgba('#ff8a00', 1), 'rgba(255, 138, 0, 1)');
  assert.equal(toRgba('#00b4ff', 0), 'rgba(0, 180, 255, 0)');
});

test('toRgba clamps a nonsense alpha rather than emitting one', () => {
  assert.equal(toRgba('#00ff00', 5), 'rgba(0, 255, 0, 1)');
  assert.equal(toRgba('#00ff00', -3), 'rgba(0, 255, 0, 0)');
  assert.equal(toRgba('#00ff00', NaN), 'rgba(0, 255, 0, 1)');
  assert.equal(toRgba('#00ff00', 'half'), 'rgba(0, 255, 0, 1)');
  assert.equal(toRgba('#00ff00'), 'rgba(0, 255, 0, 1)', 'missing alpha is opaque');
});

/* ── width ──────────────────────────────────────────────────────────────── */

test('normalizeWidth takes whole pixels inside the offered range', () => {
  assert.equal(normalizeWidth(3), 3);
  assert.equal(normalizeWidth(MIN_WIDTH), MIN_WIDTH);
  assert.equal(normalizeWidth(MAX_WIDTH), MAX_WIDTH);
  assert.equal(normalizeWidth(3.4), 3, 'rounds');
  assert.equal(normalizeWidth(3.6), 4);
  assert.equal(normalizeWidth('5'), 5, 'a range input hands back a string');
  assert.equal(normalizeWidth(' 5 '), 5);
});

test('normalizeWidth rejects what would not paint', () => {
  const rejected = [
    0, -1, MAX_WIDTH + 1, 100,
    NaN, Infinity, -Infinity,
    '', '  ', 'thick', '3px',   // "3px" would become NaN, not 3
    null, undefined, {}, []
  ];

  for (const input of rejected) {
    assert.equal(normalizeWidth(input), null, JSON.stringify(input));
  }
});

/* ── the variables the ring is drawn from ───────────────────────────────── */

test('ringVariables reflects colour, width and fill', () => {
  const vars = ringVariables({ color: '#ff8a00', width: 5, fill: true });
  assert.equal(vars['--tui-ring'], '#ff8a00');
  assert.equal(vars['--tui-ring-wash'], 'rgba(255, 138, 0, 0.1)');
  assert.equal(vars['--tui-ring-width'], '5px');
});

test('turning the fill off leaves the outline alone', () => {
  const vars = ringVariables({ color: '#00b4ff', width: 3, fill: false });
  assert.equal(vars['--tui-ring'], '#00b4ff', 'the outline keeps its colour');
  assert.equal(vars['--tui-ring-wash'], 'transparent');
  assert.equal(vars['--tui-ring-width'], '3px');
});

test('fill defaults to on, and only an explicit false turns it off', () => {
  assert.notEqual(ringVariables({ color: '#00ff00' })['--tui-ring-wash'], 'transparent');
  assert.notEqual(ringVariables({ color: '#00ff00', fill: undefined })['--tui-ring-wash'], 'transparent');
  assert.equal(ringVariables({ color: '#00ff00', fill: false })['--tui-ring-wash'], 'transparent');
});

test('ringVariables always paints something', () => {
  // A corrupted or missing stored value must fall back, never come back empty:
  // an unset custom property would leave the ring unpainted.
  const broken = [
    undefined, null, {},
    { color: 'not-a-colour', width: 'wide' },
    { color: '', width: 0 },
    { color: 42, width: -5 },
    { color: '#00ff0g', width: 999 }
  ];

  for (const input of broken) {
    const vars = ringVariables(input);
    assert.equal(vars['--tui-ring'], DEFAULT_COLOR, JSON.stringify(input));
    assert.equal(vars['--tui-ring-width'], `${DEFAULT_WIDTH}px`, JSON.stringify(input));
    assert.ok(vars['--tui-ring-wash'], 'the wash is never empty');
  }
});

/* ── motion ─────────────────────────────────────────────────────────────── */

test('auto follows the operating system', () => {
  const quiet = motionSettings('auto', true);   // "reduce motion" is on
  assert.equal(quiet.behavior, 'instant');
  assert.equal(quiet.transition, 'none');

  const normal = motionSettings('auto', false);
  assert.equal(normal.behavior, 'smooth');
  assert.equal(normal.transition, RING_TRANSITION);
});

test('an explicit choice overrides the operating system in both directions', () => {
  // Someone who asked for smooth gets smooth even with reduce-motion on.
  assert.equal(motionSettings('smooth', true).behavior, 'smooth');
  assert.equal(motionSettings('smooth', true).transition, RING_TRANSITION);

  // And instant stays instant on a machine with no such preference.
  assert.equal(motionSettings('instant', false).behavior, 'instant');
  assert.equal(motionSettings('instant', false).transition, 'none');
});

test('an unknown motion mode falls back to auto, not to smooth', () => {
  // Falling back to smooth would quietly ignore the accessibility setting,
  // which is the exact bug this feature exists to fix.
  for (const bad of [null, undefined, '', 'fast', 42, {}]) {
    assert.deepEqual(motionSettings(bad, true), motionSettings('auto', true), JSON.stringify(bad));
    assert.equal(motionSettings(bad, true).behavior, 'instant', JSON.stringify(bad));
  }
});

test('normalizeMotion only accepts the modes on offer', () => {
  for (const mode of MOTION_MODES) assert.equal(normalizeMotion(mode), mode);
  for (const bad of ['Auto', 'none', '', null, 3]) assert.equal(normalizeMotion(bad), null);
});

/* ── presets ────────────────────────────────────────────────────────────── */

test('every preset is a colour the rest of the code can use', () => {
  assert.ok(PRESETS.length > 0);

  for (const preset of PRESETS) {
    assert.equal(normalizeHex(preset.hex), preset.hex,
      `${preset.name} must already be normalised`);
    assert.ok(toRgba(preset.hex, WASH_ALPHA), `${preset.name} converts`);
    assert.ok(preset.name && preset.name.trim().length > 0, 'preset needs a label');
  }

  const hexes = PRESETS.map(p => p.hex);
  assert.equal(new Set(hexes).size, hexes.length, 'no duplicate presets');
  assert.ok(hexes.includes(DEFAULT_COLOR), 'the current default is offered as a swatch');
});
