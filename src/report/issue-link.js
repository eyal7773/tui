/**
 * The address of a new GitHub issue with the report already written in it.
 *
 * GitHub fills a new issue from the query string (title=, body=), so the
 * report window can open the issue ready to post: the user only signs in and
 * presses Create. A file cannot travel this way; a copy of the page is still
 * a zip the user drags in, and the body says where to drop it.
 *
 * A user who is not signed in is sent to GitHub's sign-in page with the
 * whole link inside its address (return_to=), escaped a second time, and
 * comes back to the filled issue after signing in. That address is the one
 * that breaks first: past about 7000 characters GitHub answers with an error
 * (500), and a longer link is dropped from it altogether. So the link is kept
 * short enough that the sign-in address stays under MAX_LOGIN_LENGTH: the
 * log's oldest events go first, then the end of the description, and the
 * body says what was left out. (Measured on github.com, 2026-10-01.)
 *
 * Loaded by report.html and by tests/issue-link.test.js; it touches no
 * browser API.
 */

(function (root) {
  const ISSUES_URL = 'https://github.com/eyal7773/tui/issues/new';
  const LOGIN_URL = 'https://github.com/login?return_to=';
  const MAX_LOGIN_LENGTH = 6500;
  const MAX_TITLE_LENGTH = 200;   // GitHub allows 256; long titles are cut in lists anyway
  const TITLE_TEXT_LENGTH = 70;

  function clip(text, max) {
    return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + '…';
  }

  /** "Problem on <address>: <first line of the description>" */
  function title(address, description) {
    const where = clip(address.trim() || 'a page', MAX_TITLE_LENGTH - 30);
    const first = (description.trim().split('\n')[0] || '').trim();
    const head = `Problem on ${where}`;
    if (!first) return head;
    return clip(`${head}: ${clip(first, TITLE_TEXT_LENGTH)}`, MAX_TITLE_LENGTH);
  }

  /**
   * The issue's text. The HTML comments are for the person posting it: they
   * show in GitHub's edit box, right where the next step happens, and not in
   * the posted issue.
   */
  function body({ address, description, log, fileName, omitted }) {
    const parts = [
      '<!-- Thank you! Your report is written below. To send it, press the green "Create" button at the bottom of this page. -->',
      '',
      '### What happened',
      description.trim() || '(no description given)',
      '',
      '### Page',
      address.trim() || '(not given)',
      ''
    ];
    if (log) {
      parts.push(
        '<details><summary>Extension log</summary>',
        '',
        '```',
        log,
        '```',
        omitted ? `\n${omitted}` : '',
        '</details>',
        ''
      );
    }
    if (fileName) {
      parts.push(
        '### Copy of the page',
        `<!-- Drag the file ${fileName} from your downloads into this box, just below this line. Then press "Create". -->`,
        ''
      );
    }
    parts.push('_Sent from Report a problem in TUI Navigator._');
    return parts.join('\n');
  }

  /** Whether the sign-in page can carry the link back. */
  function fits(url) {
    return LOGIN_URL.length + encodeURIComponent(url).length <= MAX_LOGIN_LENGTH;
  }

  function link(fields) {
    const params = new URLSearchParams({ title: title(fields.address, fields.description), body: body(fields) });
    return `${ISSUES_URL}?${params.toString()}`;
  }

  /**
   * The link for { address, description, log, fileName }, short enough for
   * GitHub's sign-in page to carry. The log's header (everything up to its first blank line) is kept;
   * its oldest events go first.
   */
  function issueUrl(fields) {
    const log = fields.log || '';
    const split = log.indexOf('\n\n');
    const header = split < 0 ? log : log.slice(0, split);
    const events = split < 0 ? [] : log.slice(split + 2).split('\n').filter(Boolean);
    const withEvents = (kept) => (kept.length ? `${header}\n\n${kept.join('\n')}` : header);

    let url = link(fields);
    for (let drop = 1; !fits(url) && drop <= events.length; drop++) {
      url = link(Object.assign({}, fields, {
        log: withEvents(events.slice(drop)),
        omitted: `(The ${drop} oldest events were left out to keep the link short enough for GitHub.)`
      }));
    }
    if (fits(url)) return url;

    // Still too long: the description itself is. Cut it to fit.
    const trimmed = Object.assign({}, fields, {
      log: header,
      omitted: events.length ? '(The events were left out to keep the link short enough for GitHub.)' : ''
    });
    let keep = fields.description.length;
    while (keep > 0) {
      keep = Math.floor(keep * 0.8);
      url = link(Object.assign({}, trimmed, {
        description: fields.description.slice(0, keep) + '\n\n(The rest of the description was too long for the link.)'
      }));
      if (fits(url)) return url;
    }
    return url;
  }

  root.TuiIssueLink = { issueUrl, title, body, fits, ISSUES_URL };
})(typeof globalThis !== 'undefined' ? globalThis : self);
