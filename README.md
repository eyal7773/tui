# TUI Navigator

[![Release Extension](https://github.com/eyal7773/tui/actions/workflows/release.yml/badge.svg)](https://github.com/eyal7773/tui/actions/workflows/release.yml)

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
    `manifest.json` lives), e.g. `c:\Users\USER\source\repos\tui\src`.

### Verify installation

-   You should see "TUI Navigator" in your list of extensions.
-   The icon (terminal arrow) should appear in your browser toolbar.

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
| **Arrrow Down / J** | Move focus to next item |
| **Arrow Up / K** | Move focus to previous item |
| **Enter** | Click/Open the selected item |
| **Esc** | Reset focus / Deactivate |

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
