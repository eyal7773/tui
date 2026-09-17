/**
 * Tests for how a release picks its number.
 *
 * Getting this wrong is expensive in a way most bugs are not: a released tag is
 * public, and the workflow prunes old ones, so a number that goes backwards or
 * collides cannot be quietly corrected afterwards.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { nextVersion, levelOf, levelFor, parse, MAJOR, MINOR, PATCH } =
  require('../scripts/next-version.js');

/* ── reading a version ──────────────────────────────────────────────────── */

test('a tag reads the same with or without its v', () => {
  assert.deepEqual(parse('v0.1.99'), [0, 1, 99]);
  assert.deepEqual(parse('0.1.99'), [0, 1, 99]);
  assert.deepEqual(parse('  v1.2.3  '), [1, 2, 3]);
});

test('anything that is not a three-part number is not a version', () => {
  assert.equal(parse('v1.2'), null);
  assert.equal(parse('v1.2.3.4'), null);
  assert.equal(parse('latest'), null);
  assert.equal(parse(''), null);
  assert.equal(parse(undefined), null);
});

/* ── how big a step each commit asks for ────────────────────────────────── */

test('feat earns a minor, everything else a patch', () => {
  assert.equal(levelOf('feat: Home and End jump to the ends of the current line'), MINOR);
  assert.equal(levelOf('feat(engine): something'), MINOR);
  assert.equal(levelOf('fix: Enter activates the link in a list row'), PATCH);
  assert.equal(levelOf('chore: tidy up'), PATCH);
  assert.equal(levelOf('ci: run the tests'), PATCH);
});

test('a bang earns a major whatever the type is', () => {
  assert.equal(levelOf('feat!: drop the old ring'), MAJOR);
  assert.equal(levelOf('fix!: change a default'), MAJOR);
  assert.equal(levelOf('refactor(engine)!: rename everything'), MAJOR);
});

test('a subject that is not a conventional commit is a patch, not an error', () => {
  assert.equal(levelOf('Merge origin/main'), PATCH);
  assert.equal(levelOf('wip'), PATCH);
  assert.equal(levelOf(''), PATCH);
  assert.equal(levelOf(undefined), PATCH);
});

test('the largest step among the commits wins', () => {
  assert.equal(levelFor(['fix: a', 'chore: b']), PATCH);
  assert.equal(levelFor(['fix: a', 'feat: b', 'chore: c']), MINOR);
  assert.equal(levelFor(['feat: a', 'fix!: b']), MAJOR);
  assert.equal(levelFor([]), PATCH);
  assert.equal(levelFor(undefined), PATCH);
});

test('a BREAKING CHANGE trailer earns a major on its own', () => {
  assert.equal(levelFor(['fix: a'], true), MAJOR);
});

/* ── the number itself ──────────────────────────────────────────────────── */

test('a patch release steps the last part', () => {
  assert.equal(nextVersion({ latest: 'v0.1.99', subjects: ['fix: a thing'] }), '0.1.100');
});

test('a feature release steps the middle part and resets the patch', () => {
  assert.equal(nextVersion({ latest: 'v0.1.99', subjects: ['feat: a thing'] }), '0.2.0');
});

test('a breaking release steps the first part and resets the rest', () => {
  assert.equal(nextVersion({ latest: 'v0.1.99', subjects: ['feat!: a thing'] }), '1.0.0');
});

test('no commits since the tag still moves, so the tag is free', () => {
  // A re-run of the same job lands here. Standing still would collide.
  assert.equal(nextVersion({ latest: 'v0.1.99', subjects: [] }), '0.1.100');
});

/* ── nothing released yet ───────────────────────────────────────────────── */

test('with no tag at all, the fallback is released as it stands', () => {
  assert.equal(nextVersion({ latest: '', subjects: ['feat: a'], fallback: '0.1.99' }), '0.1.99');
  assert.equal(nextVersion({ latest: undefined, subjects: [], fallback: '2.0.0' }), '2.0.0');
});

test('with no tag and no usable fallback, start somewhere sane', () => {
  assert.equal(nextVersion({ latest: '', subjects: [] }), '0.1.0');
  assert.equal(nextVersion({ latest: '', subjects: [], fallback: 'nonsense' }), '0.1.0');
});

/* ── numbers that are already claimed ───────────────────────────────────── */

test('a number something else already holds is stepped past', () => {
  assert.equal(
    nextVersion({ latest: 'v0.1.99', subjects: ['fix: a'], taken: ['v0.1.100'] }),
    '0.1.101'
  );
});

test('it keeps stepping while the numbers stay claimed', () => {
  assert.equal(
    nextVersion({
      latest: 'v0.1.99',
      subjects: ['fix: a'],
      taken: ['v0.1.100', 'v0.1.101', 'v0.1.102']
    }),
    '0.1.103'
  );
});

test('a claimed number on another branch of the tree does not get in the way', () => {
  // v0.2.0 is taken, but a patch release is not heading there anyway.
  assert.equal(
    nextVersion({ latest: 'v0.1.99', subjects: ['fix: a'], taken: ['v0.2.0'] }),
    '0.1.100'
  );
});

test('the claimed list tolerates junk without derailing the release', () => {
  assert.equal(
    nextVersion({ latest: 'v0.1.99', subjects: ['fix: a'], taken: ['latest', '', 'v0.1.100'] }),
    '0.1.101'
  );
});

/* ── the shape of the real repo ─────────────────────────────────────────── */

test('the repo history picks the number a human would', () => {
  assert.equal(
    nextVersion({
      latest: 'v0.1.99',
      subjects: ['fix: ArrowDown follows the column instead of leaving for the sidebar'],
      taken: ['v0.1.99', 'v0.1.98', 'v0.1.97']
    }),
    '0.1.100'
  );
});
