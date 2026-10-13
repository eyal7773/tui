/**
 * Tests for the website, built from site/ by scripts/build-site.js.
 *
 *   npm test
 *
 * docs/ is what GitHub Pages serves, so it has to be exactly what the
 * templates make, and every language has to say everything the English says.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const { build } = require('../scripts/build-site.js');
require('../src/benefit-rules.js');
require('../src/stats/benefit-figure.js');
const root = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'site', 'site.json'), 'utf8'));
const strings = lang => JSON.parse(fs.readFileSync(path.join(root, 'site', 'i18n', `${lang}.json`), 'utf8'));

/** Every dotted name with a text value: ['hero.title', 'story.p1', …]. */
function names(value, prefix) {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.keys(value).flatMap(key => names(value[key], prefix ? `${prefix}.${key}` : key));
}

test('docs/ holds exactly what the templates build', () => {
  // Building also proves every {{name}} has a value in every language.
  for (const [file, html] of Object.entries(build())) {
    const onDisk = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(onDisk, html, `${file} is stale: run npm run build-site`);
  }
});

test('every language has every text the English page has, and nothing extra', () => {
  // The figure's English lives in benefit-figure.js; the next test covers it.
  const own = lang => names(strings(lang)).filter(n => !n.startsWith('figure.strings.')).sort();
  const english = own(config.languages[0]);
  for (const lang of config.languages.slice(1)) {
    assert.deepEqual(own(lang), english, `site/i18n/${lang}.json`);
  }
});

test('a translated figure says everything the English figure says', () => {
  const english = names(globalThis.TuiBenefitFigure.STRINGS).sort();
  for (const lang of config.languages.slice(1)) {
    const words = strings(lang).figure.strings;
    assert.ok(words, `site/i18n/${lang}.json has no figure.strings`);
    assert.deepEqual(names(words).sort(), english, `site/i18n/${lang}.json figure.strings`);
  }
});

test('a translation keeps the same {placeholders} and tags as the English', () => {
  const marks = text => (text.match(/\{\w+\}|<\/?(\w+)/g) || []).sort();
  const en = strings('en');
  const figure = globalThis.TuiBenefitFigure.STRINGS;
  for (const lang of config.languages.slice(1)) {
    const other = strings(lang);
    for (const name of names(en)) {
      const get = (o, n) => n.split('.').reduce((v, k) => v[k], o);
      assert.deepEqual(marks(get(other, name)), marks(get(en, name)), `${lang}: ${name}`);
    }
    for (const name of names(figure)) {
      const get = (o, n) => n.split('.').reduce((v, k) => v[k], o);
      assert.deepEqual(marks(get(other.figure.strings, name)), marks(get(figure, name)), `${lang}: figure.strings.${name}`);
    }
  }
});

test('the figure fills every {placeholder} its texts use', () => {
  const { fill, STRINGS } = globalThis.TuiBenefitFigure;
  assert.equal(fill(STRINGS.today, { n: '12' }), '+12 today');
  assert.equal(fill(strings('he').figure.strings.shoulder.extra, { distance: '1.2 ק״מ' }), '≈ 1.2 ק״מ שהזרוע לא עברה');
});
