/**
 * Renders assets/icon.svg into every PNG the extension and the site need.
 *
 *   npm run build-icons
 *
 * Needs sharp, which is not a runtime dependency of anything else here:
 *   npm install --no-save sharp
 *
 * The SVG is the source of truth. Edit that, re-run this, commit the PNGs.
 */

const fs = require('node:fs');
const path = require('node:path');

let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.error('sharp is not installed. Run:  npm install --no-save sharp');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const MASTER = 'assets/icon.svg';
const SMALL = 'assets/icon-16.svg';

// Sizes the manifest asks for, plus the favicon the GitHub Pages site uses.
// 16px comes from its own drawing; see the comment in that file for why.
const targets = [
  { file: 'src/icons/icon16.png', size: 16, source: SMALL },
  { file: 'src/icons/icon32.png', size: 32, source: MASTER },
  { file: 'src/icons/icon192.png', size: 192, source: MASTER },
  { file: 'src/icons/icon512.png', size: 512, source: MASTER },
  { file: 'docs/icon.png', size: 192, source: MASTER }
];

/**
 * sharp rasterises an SVG at `density` DPI against its intrinsic width, so the
 * pixel count is width * density / 96. Supersample to four times the target for
 * clean edges, with a floor so tiny icons still get a decent raster and a
 * ceiling so the big ones stay inside sharp's pixel limit.
 */
function densityFor(svg, size) {
  const width = Number((svg.toString().match(/width="(\d+)"/) || [])[1]) || 128;
  const raster = Math.min(Math.max(size * 4, 512), 2048);
  return Math.round((96 * raster) / width);
}

async function main() {
  const cache = new Map();

  for (const { file, size, source } of targets) {
    if (!cache.has(source)) cache.set(source, fs.readFileSync(path.join(root, source)));
    const svg = cache.get(source);

    const out = path.join(root, file);
    // Render well above the target and let the resampler do the reduction,
    // which keeps the rounded corners and the chevron clean.
    await sharp(svg, { density: densityFor(svg, size) })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(out);

    const { size: bytes } = fs.statSync(out);
    console.log(`${String(size).padStart(3)}px  ${file.padEnd(26)} ${String(bytes).padStart(6)} bytes   <- ${source}`);
  }

  console.log('\nDone. Reload the extension to see the new icon.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
