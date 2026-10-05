/**
 * The report window, opened from "Report a problem" in the F10 menu.
 *
 * It reads the log and the page's address from the tab it was opened for
 * (tui-log.js answers in the top frame). "Send on GitHub" opens a new issue
 * with the description, the address and the log written in (issue-link.js);
 * the user posts it. Nothing is sent by the extension. Pressing it again
 * opens the issue again, for someone whose report was lost while they made
 * a GitHub account.
 *
 * A copy of the page cannot go in a link. The box for it is ticked from the
 * start, and Chrome is asked for the pageCapture permission when a button is
 * pressed, since that needs the press. With the copy, "Send on GitHub" saves
 * a zip first and the status line says to drag it into the issue. "Download
 * only" saves the same zip without going to GitHub.
 *
 * The files in the zip are named problem.txt, tui-logs-*.txt and
 * page-*.mhtml, which testenv/tui.js reads; keep them.
 */

const tabId = Number(new URLSearchParams(location.search).get('tab'));
let logText = '';
let pageAddress = '';
let savedFile = '';     // the zip with the copy of the page, once saved
let issueLink = '';     // the link last opened (testenv/tui.js reads it)

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
 * Called first thing in a button's click, which is what Chrome needs to show
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

const NO_PERMISSION = 'Without Chrome\'s permission the report goes without a copy of the page.';

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

function description() {
  return $('description').value.trim();
}

/** Both buttons need a few words first. */
function hasDescription() {
  if (description()) return true;
  setStatus('Please write a few words about what happened first.', true);
  $('description').focus();
  return false;
}

/**
 * Saves the zip, with a copy of the page when withPage. Resolves to
 * { name, hasPage, note }; a page that was closed or turned into chrome://
 * cannot be copied, and the rest is still saved.
 */
async function saveZip(withPage) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const zip = new JSZip();
  zip.file('problem.txt', (pageAddress ? `Page: ${pageAddress}\n\n` : '') + description());
  zip.file(`tui-logs-${stamp}.txt`, logText || '(no log)');
  let hasPage = false;
  let note = '';
  if (withPage) {
    try {
      zip.file(`page-${stamp}.mhtml`, await capturePage());
      hasPage = true;
    } catch (err) {
      note = `The copy of the page could not be made (${err.message}).`;
    }
  }
  const name = `tui-report-${stamp}.zip`;
  saveBlob(await zip.generateAsync({ type: 'blob' }), name);
  return { name, hasPage, note };
}

async function send() {
  if (!hasDescription()) return;
  const needsCopy = $('include-page').checked && !savedFile;
  const allowed = needsCopy ? askForCopy() : Promise.resolve(false);
  const button = $('send');
  button.disabled = true;
  try {
    let note = '';
    if (needsCopy) {
      if (await allowed) {
        setStatus('Saving the copy of the page...');
        const saved = await saveZip(true);
        // Without the copy, the zip holds nothing the issue does not; no step for it.
        if (saved.hasPage) savedFile = saved.name;
        else note = `${saved.note} The report goes without it. `;
      } else {
        note = NO_PERMISSION + ' ';
      }
    }
    const fileName = $('include-page').checked ? savedFile : '';
    // Built again each time, so a second press carries any edits.
    issueLink = TuiIssueLink.issueUrl({
      address: pageAddress,
      description: description(),
      log: logText,
      fileName: fileName
    });
    chrome.tabs.create({ url: issueLink });
    setStatus(note + (fileName
      ? `GitHub is open in a new tab. Drag ${fileName} from your downloads into the text box there, then press Create.`
      : 'GitHub is open in a new tab. Press Create there to send the report.'), !!note);
  } catch (err) {
    setStatus('Something went wrong: ' + err.message, true);
  } finally {
    button.disabled = false;
  }
}

async function saveOnly() {
  if (!hasDescription()) return;
  const allowed = askForCopy();
  const button = $('save');
  button.disabled = true;
  try {
    const withPage = await allowed;
    setStatus('Saving...');
    const saved = await saveZip(withPage);
    const note = saved.note || ($('include-page').checked && !withPage ? NO_PERMISSION : '');
    setStatus(`Saved as ${saved.name} in your downloads.${note ? ' ' + note : ''}`, !!note);
  } catch (err) {
    setStatus('The report could not be saved: ' + err.message, true);
  } finally {
    button.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('description').focus();
  $('include-page').addEventListener('change', () => { savedFile = ''; });
  $('send').addEventListener('click', send);
  $('save').addEventListener('click', saveOnly);

  // Escape closes, except while a description is being written: there it
  // would throw the text away with one stray key.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.activeElement === $('description') && $('description').value.trim()) return;
    window.close();
  });

  readLog();
});
