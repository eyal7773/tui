/**
 * Tests for the focus ring colour.
 *
 * The failure that matters is silent: CSS discards a declaration it cannot
 * parse, so a half-valid colour string does not throw, it just leaves the ring
 * invisible. Every case below is really asking "can a bad value escape?".
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

require('../src/ring-color.js');
const {
  normalizeHex, toRgb, toRgba, ringVariables, DEFAULT, WASH_ALPHA, PRESETS
} = globalThis.TuiRingColor;

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
    '#gggggg',          // not hex
    '#00ff0g',          // one bad digit at the end
    'green',            // named colours are not handled
    'rgb(0,255,0)',
    '#00 ff00',         // space in the middle
    null, undefined, 123, {}, [], true
  ];

  for (const input of rejected) {
    assert.equal(normalizeHex(input), null, JSON.stringify(input));
  }
});

test('a rejected colour never becomes a partial string', () => {
  // The dangerous bug would be returning "#00ff0" or "rgba(0, 255, NaN, 0.1)".
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

test('ringVariables always paints something', () => {
  const good = ringVariables('#ff8a00');
  assert.equal(good['--tui-ring'], '#ff8a00');
  assert.equal(good['--tui-ring-wash'], 'rgba(255, 138, 0, 0.1)');

  // A corrupted or missing stored value must fall back, never come back empty:
  // an unset custom property would leave the ring unpainted.
  for (const bad of [null, undefined, '', 'not-a-colour', 42]) {
    const vars = ringVariables(bad);
    assert.equal(vars['--tui-ring'], DEFAULT, JSON.stringify(bad));
    assert.equal(vars['--tui-ring-wash'], toRgba(DEFAULT, WASH_ALPHA));
  }
});

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
  assert.ok(hexes.includes(DEFAULT), 'the current default is offered as a swatch');
});
