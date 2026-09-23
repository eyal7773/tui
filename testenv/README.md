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
after the site's JavaScript runs will not be there.

## Try a live site

    node tui.js https://example.com key:ArrowDown*3 ring shot --debug

For a site that needs signing in, sign in once in a visible window; the session
stays in the named profile under `.work/profiles/`:

    node tui.js https://mail.google.com login --headed --profile google
    node tui.js https://mail.google.com key:ArrowDown --profile google

`node tui.js` with no arguments lists every step and option.

## Regression suite

Each fixed bug can be kept as a `scenarios/*.tui` file (the target, then one
step per line). `node suite.js` runs them all; `--ext <dir>` runs them against
another build, such as an older commit checked out with `git worktree add`.

Everything generated (unpacked reports, screenshots, profiles, the last
console log) goes to `.work/`, which git ignores.
