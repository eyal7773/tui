# TUI Navigator

[![Release Extension](https://github.com/eyal7773/tui/actions/workflows/release.yml/badge.svg)](https://github.com/eyal7773/tui/actions/workflows/release.yml)

**Website:** https://eyal7773.github.io/tui/

TUI Navigator is a chrome extension that transforms the browsing experience on data-heavy websites into a **Text-based User Interface (TUI)**. Navigate search results and lists using your keyboard with high-contrast visibility.

## Installation Instructions

### Option A — Download a release (recommended)

Every push to `main` builds a new release automatically via GitHub Actions.

1.  Go to the [Releases page](https://github.com/eyal7773/tui/releases) and download the latest
    `tui-navigator-vX.Y.Z.zip`.
2.  Unzip it anywhere on disk.
3.  Open `chrome://extensions/` in Google Chrome.
4.  Turn **Developer mode** ON (toggle in the top right corner).
5.  Click **Load unpacked** and select the unzipped folder — the one that contains `manifest.json`.

### Option B — Load straight from the repo

1.  Clone or download this repository.
2.  Open `chrome://extensions/`, turn **Developer mode** ON.
3.  Click **Load unpacked** and select the **`src`** folder of the repo (that is where
    `manifest.json` lives), e.g. `<path-to-your-clone>/tui/src`.

    Pick the `src` folder itself, not the repository root — Chrome needs the folder that
    directly contains `manifest.json`, and loading the repo root will fail.

### Verify installation

-   You should see "TUI Navigator" in your list of extensions.
-   The icon (terminal arrow) should appear in your browser toolbar.

## Ring appearance

The popup **Settings** tab sets how the ring looks: six colour swatches, a full
picker for anything else, a thickness from 1 to 8 pixels, and a switch for the
tinted interior. Reset restores all of it, motion included. Changes apply to
every open tab immediately.

This is less cosmetic than it sounds. Bright green is one of the hardest colours
to pick out with red-green colour blindness, which is common enough to matter,
and blue, orange and yellow stay distinguishable where green does not.

The swatches are the bright terminal palette, which is where the default green
already sat: pure hues at the corners of the RGB cube, which is what makes them
read as phosphor. Orange is the one exception, kept because no corner offers it
and it is one of the hues that survives colour blindness.

The settings reach the page as custom properties — `--tui-ring`,
`--tui-ring-wash` and `--tui-ring-width` — written inline on the ring element.
The rules in `styles.css` keep their `!important`, so a page still cannot
restyle the ring away, and every `var()` carries a working default as its
fallback: a missing or corrupt stored value leaves the ring green and 3px
rather than unpainted. `src/ring-style.js` does the parsing for both the page
and the popup, so the preview cannot drift from the real thing.

Turning the tint off sets the wash to `transparent` and leaves only the
outline, which keeps dense text readable underneath.

## Motion

Scrolling follows your operating system by default. The extension used to
animate every scroll regardless, which ignored the reduced-motion preference
for anyone who had set it, and made fast navigation feel sluggish for everyone
else. **Settings -> Motion** can also force smooth or instant, overriding the
system either way.

The setting covers both the page scroll and the ring's own movement.

## Home and End

**End** jumps to the far end of the line you are on, **Home** to the near end.
The last arrow you pressed decides which way a line runs: after moving sideways
it is the row you are in, after moving up or down it is the column. Before you
have moved at all the axis is horizontal, so End works on the first press.

A line is decided by overlap. On a row, anything whose vertical span covers at
least half the shorter of the two elements counts as being on it, which keeps a
tall neighbour from joining a row it merely clips.

**It reaches across the whole width of the window, not just the block you are
reading.** If a sidebar link happens to sit at the same height as the row, End
will land on it, because it genuinely is the rightmost thing at that height.
That is the rule working as intended rather than a bug, but it is worth knowing
before it surprises you.

Nothing is ever skipped over: if there is no candidate further along the line,
the ring stays where it is. Home and End never scroll, so a second press does
nothing rather than turning into a page-down.

`Ctrl+Home`, `Ctrl+End` and `Shift+Home` keep their usual meaning and are passed
to the page, and inside a text box both keys still move the caret to the start
or end of the line.

The geometry lives in `src/line-rules.js` as pure functions over rectangles, so
the awkward cases can be tested against exact coordinates.

## Enter on a list row

**Enter activates the link in the row, not the row.** Lists are usually built
the other way round from how they look: the `<li>` owns the `tabindex` and the
link inside it is deliberately unreachable by tab, so focusing the link makes
the browser move focus up to the row instead. A click on the row lands on
nothing at all - the row has no handler, and the link never sees it - which
looked exactly like Enter being ignored.

So Enter clicks what the ring was aiming at when focus bounced up. With nothing
to aim at, because focus arrived by mouse or by the page's own doing, the row's
own action is used: the first link or button in it that carries readable text.
The overflow menu, the select checkbox and the icon-only controls at the end of
a row are skipped rather than clicked by mistake, and a row with no link or
button at all still gets its content wrapper clicked, which is the shape chat
lists use.

`src/click-rules.js` holds the decision as pure functions over a tree, so the
awkward rows can be tested without a page.

## Handing the keyboard back

Spatial navigation works by moving real focus, and a site that routes its own
shortcuts by focus loses them while the ring is holding one of its links. On a
YouTube watch page, for example, space stops playing and pausing the video once
you start moving around.

**Esc hands the keyboard back.** The ring disappears, focus is released, and the
extension stops intercepting anything, so every shortcut the site defines behaves
exactly as it would with the extension uninstalled. **Esc again takes it back**
and navigation resumes.

The toolbar badge clears while the page has the keys, so the state is visible.
It lasts until the page is reloaded and is never saved; a fresh page always
starts out navigable. Inside a text box Escape keeps its existing meaning of
leaving the box, so the handover needs a second press there.

Escape is never swallowed: the page receives it either way.

## Excluded sites

Open the toolbar popup and pick the **Settings** tab to switch TUI Navigator off on
individual sites.

-   **Turn off here** excludes whatever site the current tab is on.
-   The text box takes a domain by hand. Paste a full URL if it is easier; it is
    reduced to the bare domain.
-   Exclusions cover subdomains, so `google.com` also silences `mail.google.com`.
    `notgoogle.com` is untouched.

On an excluded site the extension stops handling the arrow keys, hides the focus
ring, and records no statistics. The list lives in `chrome.storage.local` under
`tuiExcludedSites` and applies immediately to tabs that are already open.

## Weekly recap

Once a week the extension offers a short note about what you got through, and
clicking it opens the dashboard. Turn it off in the popup under **Settings**, or
with the **Not this** button on the notification itself.

It only appears when all of these hold:

-   It is Thursday, Friday or Saturday. Thursday is the intended day; the other
    two are a grace window for a browser that was closed.
-   It is past 10am, local time.
-   At least seven days have passed since the extension was installed.
-   Nothing was sent already this week (ISO week, Monday to Sunday).
-   There was something to report: at least one navigation in the last seven days.

The decision lives in `src/recap-rules.js` as a pure function, away from any
Chrome API, so it can be tested against any date instead of waiting for Thursday.
The **Config** tab has a test button that fires one immediately and a second that
explains why one would not fire right now.

On Windows the notification goes through the system notification centre. If Focus
Assist is on, or Chrome notifications are off in Windows settings, it is dropped
silently and the extension cannot tell.

## Icon

The artwork lives in `assets/` as SVG and the PNGs are generated from it:

```bash
npm install --no-save sharp
npm run build-icons
```

That writes every size the manifest asks for plus the favicon the site uses.
`icon.svg` covers 32px and up. `icon-16.svg` is a separate, simpler drawing for
the toolbar: at 16 pixels the keycap outline and the chevron inside it collapse
into each other, so that size drops the keycap and promotes the chevron instead.
Edit the SVG, re-run the build, commit the PNGs.

## Releases & Versioning

Every push to `main` builds the extension and publishes it as a GitHub Release —
see [`.github/workflows/release.yml`](.github/workflows/release.yml).

### What each run does

1.  Works out the next version from the **git tags** — see below.
2.  Writes that number into `src/manifest.json` inside the runner
    (`node scripts/stamp-version.js`). Nothing is committed back.
3.  Zips the **contents of `src/`** — `manifest.json` ends up at the zip root, so the
    unzipped folder is directly loadable with **Load unpacked**.
4.  Publishes the zip as release `vX.Y.Z`, twice: once as `tui-navigator-vX.Y.Z.zip`
    and once as `tui-navigator.zip`, which gives a permanent download link:

    ```
    https://github.com/eyal7773/tui/releases/latest/download/tui-navigator.zip
    ```

5.  Deletes releases older than the newest few (see below).

### Retention — only the newest 5 releases are kept

Old builds pile up, so the workflow prunes them automatically:

```yaml
env:
  KEEP_RELEASES: "5"   # near the top of release.yml
```

After each successful release, anything beyond the newest `KEEP_RELEASES` is deleted
with `gh release delete --cleanup-tag`, which removes **the release, its zip, and its
git tag**. This is permanent — there is no undo, so raise the number before pushing if
you need to keep an old build around. Set it to `0` to disable pruning entirely.

The build is also uploaded as an Actions artifact, kept for **7 days**. Release assets
generally do not count against your storage quota, but Actions artifacts do — that
short retention is deliberate. The artifact is only a debugging convenience; the same
zip is always on the release.

### Controlling the version

**The git tags are the source of truth.** The workflow takes the newest `v*` tag and
steps it according to the commit subjects since that tag, read as conventional commits:

| Commits since the last tag | Step | `v0.1.99` becomes |
| :--- | :--- | :--- |
| `fix:`, `chore:`, `ci:`, anything else | patch | `v0.1.100` |
| any `feat:` | minor | `v0.2.0` |
| any `feat!:` / `fix!:`, or a `BREAKING CHANGE` trailer | major | `v1.0.0` |

So the way to control the number is the way you word the commit. The logic lives in
[`scripts/next-version.js`](scripts/next-version.js) and is covered by
[`tests/next-version.test.js`](tests/next-version.test.js).

The `version` field sitting in `src/manifest.json` and `package.json` is **not**
authoritative and will drift behind the releases. It is only read as a starting point
for the very first release, when there is no tag yet.

Nothing is committed back to `main`, so your local clone is never left behind after a
release and pushes are never rejected as non-fast-forward.

### How the site keeps up

`docs/index.html` is served straight out of the repo by GitHub Pages, and releases no
longer write anything back, so the number in the markup would freeze. The page therefore
asks for the live one on load: it reads `tag_name` from

```
https://api.github.com/repos/eyal7773/tui/releases/latest
```

and fills every `<span data-version>`, caching the answer in `sessionStorage` so moving
around the site costs one request rather than several. The API allows 60 an hour per
address without a token.

Every step is allowed to fail quietly — a blocked request, a rate limit or storage turned
off leaves the committed number on the page. That number is the fallback, so it is worth
keeping roughly current: `npm run sync-site-version` rewrites it from `src/manifest.json`.

The download button does not depend on any of this. It points at
`releases/latest/download/tui-navigator.zip`, which GitHub resolves on its own.

## Usage Guide

### Supported Sites
-   **Google Search**: Navigates search results.
-   **YouTube**: Navigates search results and recommendations.
-   **Wikipedia**: Navigates article links.

### Controls
| Key | Action |
| :--- | :--- |
| **Arrow Down** | Move focus to the item below |
| **Arrow Up** | Move focus to the item above |
| **Arrow Left / Right** | Move across the current row |
| **Home / End** | Jump to either end of the current line (see below) |
| **Enter** | Activate the focused item (see below) |
| **Esc** | Leave a text box, or hand the keyboard back to the page |

### Management
Click the extension icon to:
-   See if the current site is supported.
-   View usage statistics (Total Actions).
-   Enable/Disable TUI for the current session.

## Debug Log Download

When **Admin/Debug Mode** is active, the extension captures all internal `[TUI]` log entries in memory. Open the popup → **Config** tab → click **Download Logs** to save them as a `.txt` file. Useful for diagnosing navigation issues without keeping the browser DevTools open.

## Report a Problem

The **Config** tab also includes a **Report a Problem** section. Enter a description of the issue, then click **Download Report (ZIP)** to generate a bundle containing:
- `problem.txt` — your description
- `tui-logs-*.txt` — captured debug logs
- `page-*.mhtml` — a snapshot of the current page

Requires Admin/Debug Mode to be active.

## Troubleshooting
-   **"Extension invalidated"**: If you see errors in the console, refresh the extension on the `chrome://extensions` page.
-   **No Focus Ring**: Ensure you are on a supported site. Try refreshing the page.
