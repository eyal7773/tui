# testenv

A local harness for trying the extension in a real browser. It is not part of
the extension: the release zips `src/` only.

    cd testenv
    npm install                       # once; Playwright's Chromium is fetched with
    npx playwright install chromium   # the second command if it is missing

## Reproduce a bug report

    node tui.js path/to/tui-report-....zip start:New key:ArrowDown expect:Home shot

The report's `problem.txt` is printed, and its page is replayed at its original
URL from the saved `.mhtml`. The page is not opened as an archive file, because
Chrome disables every form control inside one, so buttons could not take focus.
The capture's own scripts are blocked, which means a menu that only exists
after the site's JavaScript runs will not be there. A report saved without a
copy of the page cannot be replayed; its log is still unpacked under
`.work/reports/`.

Once the ring steps into a frame, `ring` and the steps' output show it there
(`frame> button#launch ...`), and `expect` looks for its element in that frame.
A frame a script filled in has no `src` in the saved page; it is replayed from
the saved frame meant for it, matched by order.

## Check the report's log

After `key:F10 key:ArrowDown*3 key:Enter` (Report a problem), the `report` step
reads the log the report window shows, and `report-has:<regex>` and
`report-lacks:<regex>` check it. `scenarios/report-log.tui` uses them to make
sure the log says what Enter did and holds nothing from the page.

`report-send:<text>` writes `<text>` as the description and presses **Continue to
GitHub**; from then on `report-has` and `report-lacks` check the issue it opened (its
title, then its body), and the link is saved to `.work/last-report-issue.txt`.
`scenarios/report-issue.tui` checks the title carries the address. `report-shot`
screenshots the report window.

## Try a live site

    node tui.js https://example.com key:ArrowDown*3 ring shot --debug

For a site that needs signing in, sign in once in a visible window; the session
stays in the named profile under `.work/profiles/`:

    node tui.js https://mail.google.com login --headed --profile google
    node tui.js https://mail.google.com key:ArrowDown --profile google

Each run clears the profile's cached service worker, so a change to
`background.js` is always the one tested; the sign-in stays.

`node tui.js` with no arguments lists every step and option.

## Regression suite

Each fixed bug can be kept as a `scenarios/*.tui` file (the target, then one
step per line). `node suite.js` runs them all; `--ext <dir>` runs them against
another build, such as an older commit checked out with `git worktree add`.

Everything generated (unpacked reports, screenshots, profiles, the last
console log) goes to `.work/`, which git ignores.
