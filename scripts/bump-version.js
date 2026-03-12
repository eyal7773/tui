const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, '..', 'src', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const parts = manifest.version.split('.').map(Number);
parts[2] += 1;
manifest.version = parts.join('.');

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

const packagePath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.version = manifest.version;
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');

console.log('Version bumped to', manifest.version);
