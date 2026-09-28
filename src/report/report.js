/**
 * The report window, opened from "Report a problem" in the F10 menu.
 *
 * It reads the log from the tab it was opened for (tui-log.js answers in the
 * top frame), shows every line of it, and saves a zip when asked. A copy of
 * the page is added only when the user ticks the box, and that is when Chrome
 * is asked for the pageCapture permission. Nothing is sent anywhere; the last
 * step only opens a new GitHub issue for the user to attach the file to.
 *
 * The files in the zip are named problem.txt, tui-logs-*.txt and
 * page-*.mhtml, which testenv/tui.js reads; keep them.
 */

const ISSUES_URL = 'https://github.com/eyal7773/tui/issues/new';

const tabId = Number(new URLSearchParams(location.search).get('tab'));
let logText = '';

const $ = (id) => document.getElementById(id);

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
      showLog('', 'The log could not be read: the page was closed or reloaded. You can still save your description.');
      return;
    }
    $('site').textContent = response.site || 'this page';
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

/** Ticking the box is the moment Chrome is asked for the permission. */
function onIncludePage(e) {
  if (!e.target.checked) return;
  chrome.permissions.request({ permissions: ['pageCapture'] }, (granted) => {
    if (!granted) {
      e.target.checked = false;
      setStatus('Without that permission the report is saved without a copy of the page.');
    } else {
      setStatus('');
    }
  });
}

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

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function save() {
  const button = $('save');
  button.disabled = true;
  setStatus('Saving...');
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zip = new JSZip();
    zip.file('problem.txt', $('description').value.trim() || '(no description given)');
    zip.file(`tui-logs-${stamp}.txt`, logText || '(no log)');
    // A page that was closed or turned into chrome:// cannot be copied. The
    // description and log are still worth having, so save without the copy.
    let note = '';
    if ($('include-page').checked) {
      try {
        zip.file(`page-${stamp}.mhtml`, await capturePage());
      } catch (err) {
        note = ` The copy of the page could not be made (${err.message}), so it is not in the file.`;
      }
    }
    saveBlob(await zip.generateAsync({ type: 'blob' }), `tui-report-${stamp}.zip`);
    setStatus(`Saved as tui-report-${stamp}.zip in your downloads.${note}`, !!note);
    $('next').hidden = false;
    $('open-issue').focus();
  } catch (err) {
    setStatus('The report could not be saved: ' + err.message, true);
  } finally {
    button.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('description').focus();
  $('include-page').addEventListener('change', onIncludePage);
  $('save').addEventListener('click', save);
  $('close').addEventListener('click', () => window.close());
  $('open-issue').addEventListener('click', () => chrome.tabs.create({ url: ISSUES_URL }));

  // Escape closes, except while a description is being written: there it
  // would throw the text away with one stray key.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.activeElement === $('description') && $('description').value.trim()) return;
    window.close();
  });

  readLog();
});
