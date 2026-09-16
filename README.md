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

## Ring colour

The popup **Settings** tab sets the colour of the ring: six swatches, a full
picker for anything else, and Reset. It applies to every open tab immediately.

This is less cosmetic than it sounds. Bright green is one of the hardest colours
to pick out with red-green colour blindness, which is common enough to matter,
and blue, orange and yellow stay distinguishable where green does not.

The colour is stored as `tuiRingColor` and reaches the page as two custom
properties, `--tui-ring` and `--tui-ring-wash`, written inline on the ring
element. The rules in `styles.css` keep their `!important`, so a page still
cannot restyle the ring away, and each `var()` carries the default green as a
fallback: a missing or corrupt stored value leaves the ring green rather than
unpainted. `src/ring-color.js` does the parsing for both the page and the
popup, so the preview cannot drift from the real thing.

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

1.  Reads the version from `src/manifest.json`.
2.  If that version was already released, bumps the patch number
    (`npm run bump-version`) and commits it back to `main` as
    `chore: release vX.Y.Z [skip ci]`.
3.  Zips the **contents of `src/`** — `manifest.json` ends up at the zip root, so the
    unzipped folder is directly loadable with **Load unpacked**.
4.  Publishes the zip as release `vX.Y.Z`.
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

Run `npm run bump-version` locally (or edit `src/manifest.json`) before pushing, and the
workflow will publish your number instead of bumping one of its own. It only bumps when
the version in the manifest has already been released.

### Heads-up: pull after every push

Because the workflow commits the version bump back to `main`, your local branch is one
commit behind after each run. Pull before your next commit, or the push is rejected as
a non-fast-forward:

```bash
git pull --rebase
```

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
| **Enter** | Activate the focused item |
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
