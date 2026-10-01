/**
 * The report window, opened from "Report a problem" in the F10 menu.
 *
 * It reads the log from the tab it was opened for (tui-log.js answers in the
 * top frame) and shows every line of it. "Continue to GitHub" opens a new
 * issue with the description, the page's address and the log written in
 * (issue-link.js); the user posts it. Nothing is sent by the extension.
 * After that the same button is "Open GitHub again", for someone whose
 * report was lost while they made a GitHub account.
 *
 * A copy of the page cannot go in a link. When the user ticks the box (the
 * moment Chrome is asked for the pageCapture permission), the button saves a
 * zip first and the steps tell them to drag it into the issue. "Only save the
 * report as a file" saves the same zip without going to GitHub.
 *
 * The files in the zip are named problem.txt, tui-logs-*.txt and
 * page-*.mhtml, which testenv/tui.js reads; keep them.
 */

const tabId = Number(new URLSearchParams(location.search).get('tab'));
let logText = '';
let sent = false;       // GitHub was opened once; the button now opens it again
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
    $('site').textContent = response.site || 'this page';
    if (!$('address').value) $('address').value = response.url || '';
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
 * The steps and the button say whether there is a file to drag in, and
 * whether GitHub is already open.
 */
function showSteps() {
  const withFile = $('include-page').checked;
  $('step-file').hidden = !withFile;
  $('send-heading').textContent = sent ? 'Finish on GitHub' : 'Send it';
  $('steps-lead').textContent = sent ? 'GitHub is open in a new tab. There:' : 'When you press the button below:';
  $('step-open').hidden = sent;
  $('again-note').hidden = !sent;
  if (sent) $('send').textContent = 'Open GitHub again';
  else $('send').textContent = withFile ? 'Save the file and continue to GitHub' : 'Continue to GitHub';
}

/** Ticking the box is the moment Chrome is asked for the permission. */
function onIncludePage(e) {
  showSteps();
  savedFile = '';
  if (!e.target.checked) return;
  chrome.permissions.request({ permissions: ['pageCapture'] }, (granted) => {
    if (!granted) {
      e.target.checked = false;
      showSteps();
      setStatus('Without that permission the report goes without a copy of the page.');
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

function description() {
  return $('description').value.trim();
}

/**
 * Saves the zip. withPage false leaves the copy out even when the box is
 * ticked. Resolves to { name, hasPage, note }; a page that was closed or
 * turned into chrome:// cannot be copied, and the rest is still saved.
 */
async function saveZip(withPage) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const zip = new JSZip();
  const address = $('address').value.trim();
  zip.file('problem.txt', (address ? `Page: ${address}\n\n` : '') + (description() || '(no description given)'));
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
  if (!description()) {
    setStatus('Please write a few words about what happened first.', true);
    $('description').focus();
    return;
  }
  const button = $('send');
  button.disabled = true;
  try {
    setStatus('');
    if ($('include-page').checked && !savedFile) {
      setStatus('Saving the file...');
      const saved = await saveZip(true);
      if (saved.hasPage) {
        savedFile = saved.name;
        $('file-name').textContent = saved.name;
        setStatus(`Saved ${saved.name} in your downloads.`);
      } else {
        // Without the copy, the zip holds nothing the issue does not; no step for it.
        $('include-page').checked = false;
        setStatus(`${saved.note} The report goes without it.`, true);
      }
    }
    // Built again each time, so "Open GitHub again" carries any edits.
    issueLink = TuiIssueLink.issueUrl({
      address: $('address').value,
      description: description(),
      log: logText,
      fileName: $('include-page').checked ? savedFile : ''
    });
    chrome.tabs.create({ url: issueLink });
    sent = true;
    showSteps();
  } catch (err) {
    setStatus('Something went wrong: ' + err.message, true);
  } finally {
    button.disabled = false;
  }
}

async function saveOnly() {
  const button = $('save');
  button.disabled = true;
  setStatus('Saving...');
  try {
    const saved = await saveZip($('include-page').checked);
    setStatus(`Saved as ${saved.name} in your downloads.${saved.note ? ' ' + saved.note : ''}`, !!saved.note);
  } catch (err) {
    setStatus('The report could not be saved: ' + err.message, true);
  } finally {
    button.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('description').focus();
  $('include-page').addEventListener('change', onIncludePage);
  $('send').addEventListener('click', send);
  $('save').addEventListener('click', saveOnly);
  $('close').addEventListener('click', () => window.close());

  // Escape closes, except while a description is being written: there it
  // would throw the text away with one stray key.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.activeElement === $('description') && $('description').value.trim()) return;
    window.close();
  });

  showSteps();
  readLog();
});
