// Downloads the reports sent from F10 > Report a problem into examples/, and
// deletes each one from the report server (server/) once it is saved here.
//
//   npm run pull-reports
//   node scripts/pull-reports.js [--server https://...]
//
// The token is the server's password (its PULL_TOKEN secret): taken from
// TUI_REPORTS_TOKEN, or else from .reports-token at the repo root, which git
// ignores. Each report's problem.txt is printed; replay one with
//   node testenv/tui.js examples/<file>.zip

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'examples');
const TOKEN_FILE = path.join(ROOT, '.reports-token');

let server = 'https://tui-reports.taliandeyal.workers.dev';
const at = process.argv.indexOf('--server');
if (at > 0) server = process.argv[at + 1].replace(/\/$/, '');

function readToken() {
  if (process.env.TUI_REPORTS_TOKEN) return process.env.TUI_REPORTS_TOKEN.trim();
  if (fs.existsSync(TOKEN_FILE)) return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  console.error('No token: set TUI_REPORTS_TOKEN or put it in .reports-token');
  process.exit(1);
}

const headers = { Authorization: 'Bearer ' + readToken() };

async function call(method, url) {
  const res = await fetch(url, { method, headers });
  // The server answers 404 to a wrong token too, so say both.
  if (res.status === 404) throw new Error(`${method} ${url}: 404 (wrong token, or no such report)`);
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status}`);
  return res;
}

async function problemText(buffer) {
  const JSZip = require(path.join(ROOT, 'src', 'lib', 'jszip.min.js'));
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file('problem.txt');
  return entry ? (await entry.async('string')).trim() : '(no problem.txt)';
}

(async () => {
  const { reports } = await (await call('GET', `${server}/reports`)).json();
  if (!reports.length) {
    console.log('No new reports.');
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  for (const report of reports) {
    const buffer = Buffer.from(await (await call('GET', `${server}/reports/${report.id}`)).arrayBuffer());
    const file = path.join(OUT, report.id);
    fs.writeFileSync(file, buffer);
    // Deleted only once the file is on disk here.
    await call('DELETE', `${server}/reports/${report.id}`);
    console.log(`${path.relative(ROOT, file)}  (${Math.round(buffer.length / 1024)} KB, sent ${report.uploaded})`);
    console.log('  ' + (await problemText(buffer)).replace(/\n/g, '\n  ') + '\n');
  }
  console.log(`${reports.length} report${reports.length === 1 ? '' : 's'} saved in examples/.`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
