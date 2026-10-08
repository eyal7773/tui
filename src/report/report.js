/**
 * The report window, opened from "Report a problem" in the F10 menu.
 *
 * It reads the log and the page's address from the tab it was opened for
 * (tui-log.js answers in the top frame). "Send report" puts the description,
 * the log and, with the box ticked, a copy of the page in a zip and posts it
 * to the report server (server/ in this repo), where it waits until the
 * developer downloads it with scripts/pull-reports.js. Nothing is sent before
 * the button is pressed.
 *
 * The box for the copy is ticked from the start, and Chrome is asked for the
 * pageCapture permission when the button is pressed, since that needs the
 * press.
 *
 * The files in the zip are named problem.txt, tui-logs-*.txt and
 * page-*.mhtml, which testenv/tui.js reads; keep them.
 */

const REPORT_URL = 'https://tui-reports.taliandeyal.workers.dev/reports';

const tabId = Number(new URLSearchParams(location.search).get('tab'));
let logText = '';
let pageAddress = '';

const $ = (id) => document.getElementById(id);

// How long the thanks stays before the window closes itself.
const CLOSE_AFTER_MS = 1500;
const CLOSE_AFTER_NOTE_MS = 5000;

function setStatus(text, isError = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', isError);
}

function readLog() {
  if (!Number.isInteger(tabId)) {
    showLog('', 'No page was given, so there is no log to include.');
    return;
  }
  chrome.tabs.sendMessage(tabId, { type: 'GET_TUI_LOG' }, { frameId: 0 }, (response) => {
    if (chrome.runtime.lastError || !response) {
      showLog('', 'The log could not be read: the page was closed or reloaded. You can still send your description.');
      return;
    }
    pageAddress = response.url || '';
    $('address').textContent = pageAddress || 'unknown';
    showLog(response.text || '');
  });
}

function showLog(text, problem) {
  logText = text;
  $('log').textContent = text || problem;
  const verbose = /^verbose: yes$/m.test(text);
  $('log-verbose').hidden = !verbose;
  $('log-plain').hidden = verbose;
}

/**
 * Asks Chrome for the permission to copy the page, if the box is ticked.
 * Called first thing in the button's click, which is what Chrome needs to show
 * its question; once granted, it answers at once without asking.
 */
function askForCopy() {
  if (!$('include-page').checked) return Promise.resolve(false);
  return new Promise((resolve) => {
    chrome.permissions.request({ permissions: ['pageCapture'] }, (granted) => {
      resolve(!chrome.runtime.lastError && !!granted);
    });
  });
}

const NO_PERMISSION = 'Without Chrome\'s permission the report went without a copy of the page.';

function capturePage() {
  return new Promise((resolve, reject) => {
    chrome.pageCapture.saveAsMHTML({ tabId: tabId }, (data) => {
      if (chrome.runtime.lastError || !data) {
        reject(new Error(chrome.runtime.lastError ? chrome.runtime.lastError.message : 'capture failed'));
      } else {
        resolve(data);
      }
    });
  });
}

function description() {
  return $('description').value.trim();
}

/** The button needs a few words first. */
function hasDescription() {
  if (description()) return true;
  setStatus('Please write a few words about what happened first.', true);
  $('description').focus();
  return false;
}

/**
 * The zip, with a copy of the page when withPage. Resolves to { blob, note };
 * a page that was closed or turned into chrome:// cannot be copied, and the
 * rest is still sent. Compressed: the copy of the page is mostly text.
 */
async function buildZip(withPage) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const zip = new JSZip();
  zip.file('problem.txt', (pageAddress ? `Page: ${pageAddress}\n\n` : '') + description());
  zip.file(`tui-logs-${stamp}.txt`, logText || '(no log)');
  let note = '';
  if (withPage) {
    try {
      zip.file(`page-${stamp}.mhtml`, await capturePage());
    } catch (err) {
      note = `The copy of the page could not be made (${err.message}), so the report went without it.`;
    }
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return { blob, note };
}

async function upload(blob) {
  let res;
  try {
    res = await fetch(REPORT_URL, { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: blob });
  } catch (err) {
    throw new Error('no connection to the report server');
  }
  if (res.ok) return;
  if (res.status === 413) throw new Error('it is too large; untick the copy of the page and try again');
  if (res.status === 429) throw new Error('too many reports were sent just now; wait a minute');
  throw new Error(`the server answered ${res.status}`);
}

async function send() {
  if (!hasDescription()) return;
  const allowed = askForCopy();
  const button = $('send');
  button.disabled = true;
  let sent = false;
  try {
    const withPage = await allowed;
    setStatus('Sending...');
    const built = await buildZip(withPage);
    await upload(built.blob);
    sent = true;
    const note = built.note || ($('include-page').checked && !withPage ? NO_PERMISSION : '');
    setStatus(`Thank you. Your report was sent.${note ? ' ' + note : ''}`);
    // The window was opened for this report alone; once it is sent it goes,
    // after long enough to read the thanks (and the note, when there is one).
    setTimeout(() => window.close(), note ? CLOSE_AFTER_NOTE_MS : CLOSE_AFTER_MS);
  } catch (err) {
    setStatus(`The report could not be sent: ${err.message}. Press Send report to try again.`, true);
  } finally {
    // Sent once; changing the description or the box allows another.
    button.disabled = sent;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('description').focus();
  const allowAgain = () => { $('send').disabled = false; };
  $('description').addEventListener('input', allowAgain);
  $('include-page').addEventListener('change', allowAgain);
  $('send').addEventListener('click', send);

  // Escape closes, except while a description is being written: there it
  // would throw the text away with one stray key.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.activeElement === $('description') && $('description').value.trim()) return;
    window.close();
  });

  readLog();
});
