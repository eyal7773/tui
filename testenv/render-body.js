#!/usr/bin/env node
/**
 * Renders the body figure's pictures: three mannequin parts (wrist, forearm,
 * shoulder), each as three transparent layers (calm, heat, ring), into
 * src/stats/body/. The scenes are in render-body/body.html and drawn with
 * three.js, which only this script loads; the extension ships the images.
 *
 *   node render-body.js
 *
 * Then `npm run sync-site-figure` in the repo root copies them to the site.
 * Needs the network once, for three.js from jsDelivr.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const PAGE = path.join(__dirname, 'render-body', 'body.html');
const OUT = path.join(__dirname, '..', 'src', 'stats', 'body');

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (err) => console.error('page error:', err.message));
    await page.goto(pathToFileURL(PAGE).href);
    await page.waitForFunction(() => window.rendererReady === true, null, { timeout: 30000 });
    const layers = await page.evaluate(() => window.renderAll());

    fs.mkdirSync(OUT, { recursive: true });
    for (const [name, url] of Object.entries(layers)) {
      const data = Buffer.from(url.replace(/^data:image\/webp;base64,/, ''), 'base64');
      if (!url.startsWith('data:image/webp')) throw new Error(`${name}: the browser did not encode WebP`);
      fs.writeFileSync(path.join(OUT, `${name}.webp`), data);
      console.log(`${name}.webp  ${(data.length / 1024).toFixed(1)} KB`);
    }
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
