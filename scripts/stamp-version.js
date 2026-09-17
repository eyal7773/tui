// Writes the version being released into src/manifest.json, so the number
// Chrome shows comes out of the git tag rather than out of the repo.
//
//   node scripts/stamp-version.js 1.2.3
//
// The release workflow runs this inside the runner and never commits the
// result. The number sitting in the committed manifest is therefore whatever it
// happened to be last time anyone touched it: it is not what ships, and nothing
// reads it except the very first release, which has no tag to read instead.

const fs = require('fs');
const path = require('path');

const version = process.argv[2];

if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('Not a version number: ' + (version || '(none given)'));
  process.exit(1);
}

const manifestPath = path.join(__dirname, '..', 'src', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

manifest.version = version;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log('manifest.json set to ' + version);
