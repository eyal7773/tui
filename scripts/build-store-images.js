/**
 * Builds the Chrome Web Store images in assets/store/ from raw screenshots:
 * five 1280x800 screenshots (a caption over a framed shot), the 440x280
 * small promo tile and the 1400x560 marquee tile. Five is as many as the
 * store takes. Without a dir only the two promo tiles are built.
 *
 *   node scripts/build-store-images.js [dir with the raw 1280x800 shots]
 *
 * The raw shots were taken with testenv at --viewport 1280x800 on a fresh
 * profile (no sign-ins), with made-up stats: ring.png, menu.png, f10.png,
 * stats.png, scroll.png. scroll.png is Wikipedia in the middle of a held
 * Shift+ArrowDown (keydown events with repeat set, 60ms apart), so the cue
 * is still up when the shot is taken.
 */

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(__dirname, '..', 'testenv', 'node_modules', 'playwright'));

const root = path.join(__dirname, '..');
const RAW = process.argv[2] && path.resolve(process.argv[2]);
const OUT = path.join(root, 'assets', 'store');

const GREEN = '#22C55E';
const INK = '#111826';
const icon = fs.readFileSync(path.join(root, 'assets', 'icon.svg'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

const SHOTS = [
  { file: '1-arrow-keys.png', raw: 'ring.png',
    title: 'Browse any site with the <em>arrow keys</em>',
    sub: 'A clear ring shows where you are. Enter opens it.' },
  { file: '2-menus.png', raw: 'menu.png',
    title: 'Works inside <em>menus</em> too',
    sub: 'The ring moves by where things are on screen, wherever they open.' },
  { file: '3-f10-menu.png', raw: 'f10.png',
    title: '<em>F10</em> for everything else',
    sub: 'Duplicate the page, go back, select text, see every shortcut.' },
  { file: '4-stats.png', raw: 'stats.png',
    title: 'See what your hands <em>didn’t have to do</em>',
    sub: 'Clicks, reaches and minutes saved. Kept on your computer only.' },
  { file: '5-scroll.png', raw: 'scroll.png',
    title: 'Scroll <em>without losing your place</em>',
    sub: 'Shift+↑↓ scrolls the page. The ring stays on what you chose.' }
];

const base = `
  * { box-sizing: border-box; margin: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #fff; overflow: hidden;
    background: radial-gradient(ellipse at 50% 0%, #1d3b2c 0%, ${INK} 60%); }
  em { font-style: normal; color: ${GREEN}; }`;

function shotPage({ title, sub }, dataUrl) {
  return `<!doctype html><html><head><style>${base}
    body { width: 1280px; height: 800px; display: flex; flex-direction: column; align-items: center; }
    h1 { margin-top: 42px; font-size: 48px; font-weight: 700; letter-spacing: -0.5px; }
    p { margin-top: 9px; font-size: 22px; color: #b8c2cf; }
    .window { margin-top: 36px; width: 1040px; border-radius: 12px 12px 0 0; overflow: hidden;
      background: #fff; box-shadow: 0 24px 60px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.08); }
    .bar { height: 30px; background: #e9ecef; display: flex; gap: 7px; align-items: center; padding-left: 14px; }
    .bar i { width: 11px; height: 11px; border-radius: 50%; background: #c4c9cf; }
    .window img { display: block; width: 1040px; }
  </style></head><body>
    <h1>${title}</h1><p>${sub}</p>
    <div class="window"><div class="bar"><i></i><i></i><i></i></div><img src="${dataUrl}"></div>
  </body></html>`;
}

const key = (d, cls = '') => `<span class="key ${cls}"><svg viewBox="0 0 24 24"><path d="${d}" fill="none" stroke="${GREEN}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
const arrowKeys = `${key('M5 15l7-7 7 7', 'up')}
      ${key('M15 5l-7 7 7 7')}${key('M5 9l7 7 7-7')}${key('M9 5l7 7-7 7')}`;

function promoPage() {
  return `<!doctype html><html><head><style>${base}
    body { width: 440px; height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .logo { display: flex; align-items: center; gap: 14px; }
    .logo svg { width: 64px; height: 64px; }
    h1 { font-size: 34px; font-weight: 700; letter-spacing: -0.5px; }
    p { margin-top: 12px; font-size: 17px; color: #b8c2cf; }
    .keys { margin-top: 20px; display: grid; grid-template-columns: repeat(3, 34px); gap: 5px; }
    .key { width: 34px; height: 30px; border-radius: 7px; background: #1e293b; border: 1px solid #334155;
      box-shadow: 0 2px 0 #0b1220; display: flex; align-items: center; justify-content: center; }
    .key svg { width: 15px; height: 15px; }
    .up { grid-column: 2; }
    .key:not(.up) { grid-row: 2; }
  </style></head><body>
    <div class="logo">${icon}<h1>TUI Navigator</h1></div>
    <p>Browse the web with the <em>arrow keys</em></p>
    <div class="keys">
      ${arrowKeys}
    </div>
  </body></html>`;
}

// The marquee draws its own page (grey bars for text) rather than a real
// site, so no other brand shows in the store's banner.
function marqueePage() {
  const lines = (n, w) => Array.from({ length: n }, (_, i) => `<b style="width:${w[i % w.length]}%"></b>`).join('');
  const card = (cls = '') => `<div class="card ${cls}"><div class="pic"></div>${lines(2, [92, 64])}</div>`;
  return `<!doctype html><html><head><style>${base}
    body { width: 1400px; height: 560px; display: flex; align-items: center; padding-left: 110px;
      background: radial-gradient(ellipse at 22% 10%, #1d3b2c 0%, ${INK} 55%); }
    .text { width: 520px; }
    .logo { display: flex; align-items: center; gap: 22px; }
    .logo svg { width: 96px; height: 96px; }
    h1 { font-size: 56px; font-weight: 700; letter-spacing: -1px; }
    p { margin-top: 22px; font-size: 28px; line-height: 1.35; color: #b8c2cf; }
    .keys { margin-top: 34px; display: grid; grid-template-columns: repeat(3, 52px); gap: 7px; }
    .key { width: 52px; height: 46px; border-radius: 10px; background: #1e293b; border: 1px solid #334155;
      box-shadow: 0 3px 0 #0b1220; display: flex; align-items: center; justify-content: center; }
    .key svg { width: 22px; height: 22px; }
    .up { grid-column: 2; }
    .key:not(.up) { grid-row: 2; }
    .window { position: absolute; left: 720px; top: 70px; width: 760px; height: 520px; border-radius: 12px 0 0 0;
      overflow: hidden; background: #f4f6f9; box-shadow: 0 24px 60px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.08); }
    .bar { height: 30px; background: #e9ecef; display: flex; gap: 7px; align-items: center; padding-left: 14px; }
    .bar i { width: 11px; height: 11px; border-radius: 50%; background: #c4c9cf; }
    .nav { height: 52px; background: #fff; border-bottom: 1px solid #e2e6ea; display: flex; align-items: center; gap: 26px; padding: 0 28px; }
    .nav .brand { width: 110px; height: 18px; border-radius: 4px; background: #334155; }
    .nav b { width: 54px; height: 10px; border-radius: 5px; background: #cbd2da; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; padding: 26px 28px; }
    .card { background: #fff; border-radius: 10px; padding: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .card .pic { height: 120px; border-radius: 6px; background: linear-gradient(135deg, #d6dde5, #c3ccd6); margin-bottom: 12px; }
    .card b { display: block; height: 11px; border-radius: 6px; background: #cbd2da; margin-top: 8px; }
    .card.on { outline: 4px solid ${GREEN}; outline-offset: 3px; background: #f0fdf4; }
    .card.on .pic { background: linear-gradient(135deg, #bbf7d0, #86efac); }
    .card.on b { background: #4b5563; }
  </style></head><body>
    <div class="text">
      <div class="logo">${icon}<h1>TUI Navigator</h1></div>
      <p>Browse any site with the <em>arrow keys</em>.<br>A clear ring shows where you are.</p>
      <div class="keys">
        ${arrowKeys}
      </div>
    </div>
    <div class="window"><div class="bar"><i></i><i></i><i></i></div>
      <div class="nav"><span class="brand"></span><b></b><b></b><b></b><b></b></div>
      <div class="grid">${card()}${card('on')}${card()}${card()}${card()}${card()}</div>
    </div>
  </body></html>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const render = async (html, w, h, file) => {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.setContent(html, { waitUntil: 'load' });
    await page.screenshot({ path: path.join(OUT, file) });
    await page.close();
    console.log(`${w}x${h}  assets/store/${file}`);
  };
  for (const s of RAW ? SHOTS : []) {
    const data = 'data:image/png;base64,' + fs.readFileSync(path.join(RAW, s.raw)).toString('base64');
    await render(shotPage(s, data), 1280, 800, s.file);
  }
  await render(promoPage(), 440, 280, 'promo-440x280.png');
  await render(marqueePage(), 1400, 560, 'marquee-1400x560.png');
  await browser.close();
})();
