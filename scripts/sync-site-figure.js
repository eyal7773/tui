// Copies the body figure into the GitHub Pages site, which is served from
// docs/ and cannot reach src/. The extension's files are the ones to edit;
// a test (tests/benefit-rules.test.js) fails while the copies differ.
//
//   node scripts/sync-site-figure.js

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const target = path.join(root, 'docs', 'benefit');

const files = [
  ['src/benefit-rules.js', 'benefit-rules.js'],
  ['src/stats/benefit-figure.js', 'benefit-figure.js'],
  ['src/stats/benefit-figure.css', 'benefit-figure.css']
];

// The pictures, rendered by testenv/render-body.js.
const body = path.join(root, 'src', 'stats', 'body');
for (const name of fs.readdirSync(body)) {
  files.push([`src/stats/body/${name}`, `body/${name}`]);
}

fs.mkdirSync(path.join(target, 'body'), { recursive: true });
for (const [from, name] of files) {
  fs.copyFileSync(path.join(root, from), path.join(target, name));
  console.log(`${from} -> docs/benefit/${name}`);
}
