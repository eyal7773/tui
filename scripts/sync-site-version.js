// Rewrites every <span data-version>…</span> in the GitHub Pages site so the
// published page always shows the version that was actually released.
//
//   node scripts/sync-site-version.js            # read version from src/manifest.json
//   node scripts/sync-site-version.js 1.2.3      # use an explicit version
//
// Exits 0 whether or not anything changed; the caller decides what to do with
// the result (the release workflow commits if `git diff` is non-empty).

const fs = require('fs');
const path = require('path');

const sitePath = path.join(__dirname, '..', 'docs', 'index.html');
const manifestPath = path.join(__dirname, '..', 'src', 'manifest.json');

const version =
  process.argv[2] || JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version;

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Not a version number: ' + version);
  process.exit(1);
}

const before = fs.readFileSync(sitePath, 'utf8');
let hits = 0;

const after = before.replace(
  /(<span data-version[^>]*>)([^<]*)(<\/span>)/g,
  (match, open, current, close) => {
    hits += 1;
    return open + version + close;
  }
);

if (hits === 0) {
  console.error('No <span data-version> placeholders found in docs/index.html');
  process.exit(1);
}

if (after === before) {
  console.log('Site already at v' + version + ' (' + hits + ' placeholders)');
} else {
  fs.writeFileSync(sitePath, after);
  console.log('Site set to v' + version + ' (' + hits + ' placeholders)');
}
