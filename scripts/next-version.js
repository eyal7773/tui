/**
 * What the next release should be called.
 *
 * The git tags are the source of truth. Nothing in the repo records the shipped
 * version any more, so a release no longer needs a commit pushed back to `main`
 * and your local branch never falls behind.
 *
 * The size of the step comes from the commit subjects since the last tag, read
 * as conventional commits: `feat:` earns a minor, a `!` or a BREAKING CHANGE
 * trailer earns a major, anything else is a patch.
 *
 * The decision itself is pure — tag in, version out — so it can be tested
 * against exact inputs. Only the CLI at the bottom talks to git.
 */

'use strict';

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

// type, optional (scope), optional ! meaning breaking, then the colon.
const CONVENTIONAL = /^([a-zA-Z]+)(\([^)]*\))?(!)?:/;

const MAJOR = 'major';
const MINOR = 'minor';
const PATCH = 'patch';

/** '0.1.99' or 'v0.1.99' -> [0, 1, 99]; anything else -> null. */
function parse(version) {
  if (typeof version !== 'string') return null;
  const match = VERSION.exec(version.trim().replace(/^v/, ''));
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function format(parts) {
  return parts.join('.');
}

/** Which part of the number a single commit subject asks us to move. */
function levelOf(subject) {
  if (typeof subject !== 'string') return PATCH;

  const match = CONVENTIONAL.exec(subject.trim());
  if (!match) return PATCH;

  if (match[3]) return MAJOR;                                // feat!: / fix!:
  if (match[1].toLowerCase() === 'feat') return MINOR;
  return PATCH;
}

/** The largest step any of these commits asks for. */
function levelFor(subjects, breaking) {
  if (breaking) return MAJOR;

  let level = PATCH;
  for (const subject of subjects || []) {
    const next = levelOf(subject);
    if (next === MAJOR) return MAJOR;
    if (next === MINOR) level = MINOR;
  }
  return level;
}

function bump(parts, level) {
  const [major, minor, patch] = parts;
  if (level === MAJOR) return [major + 1, 0, 0];
  if (level === MINOR) return [major, minor + 1, 0];
  return [major, minor, patch + 1];
}

/**
 * @param {object} options
 * @param {string} [options.latest] the newest existing tag, e.g. 'v0.1.99'
 * @param {string[]} [options.subjects] commit subjects since that tag
 * @param {boolean} [options.breaking] a BREAKING CHANGE trailer appeared
 * @param {string[]} [options.taken] versions or tags already claimed
 * @param {string} [options.fallback] the version to use when there is no tag yet
 * @returns {string} a version string that nothing has claimed
 */
function nextVersion(options) {
  const { latest, subjects, breaking, taken, fallback } = options || {};

  const claimed = new Set(
    (taken || [])
      .map(parse)
      .filter(Boolean)
      .map(format)
  );

  const previous = parse(latest);

  // No tag yet: the fallback is the first release, not something to bump past.
  let candidate = previous
    ? bump(previous, levelFor(subjects, breaking))
    : parse(fallback) || [0, 1, 0];

  // A re-run, or a tag that pruning left behind, can already hold the number we
  // landed on. Step forward until it is free rather than failing the release.
  let guard = 0;
  while (claimed.has(format(candidate)) && guard < 1000) {
    candidate = bump(candidate, PATCH);
    guard += 1;
  }

  return format(candidate);
}

module.exports = { nextVersion, levelOf, levelFor, parse, MAJOR, MINOR, PATCH };

/* ── CLI ────────────────────────────────────────────────────────────────── */

if (require.main === module) {
  const lines = (value) =>
    (value || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

  process.stdout.write(
    nextVersion({
      latest: process.env.LATEST,
      subjects: lines(process.env.SUBJECTS),
      breaking: process.env.BREAKING === '1',
      taken: lines(process.env.TAKEN),
      fallback: process.env.FALLBACK
    }) + '\n'
  );
}
