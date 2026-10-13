# Chrome Web Store: privacy answers

What to fill in on the store's **Privacy practices** tab, and why. Keep it in step
with [privacy.html](privacy.html), which is the privacy policy the listing links to:
`https://eyal7773.github.io/tui/privacy.html`.

## Single purpose

Navigate any web page with the arrow keys: a visible focus ring moves between the
things you can click or type into, by where they are on screen.

## Permission justifications

| Permission | Justification |
| :--- | :--- |
| Host access (content script on `<all_urls>`) | The arrow keys have to work on whatever page the user is on. The script only reads the layout of the page to move the ring, and sends nothing. |
| `storage` | The user's settings (ring colour, excluded sites, motion) and local usage counts for the stats page. |
| `activeTab` | The popup shows and changes the setting for the site in the current tab. |
| `notifications`, `alarms` | The weekly recap notification, which the user can turn off. |
| `pageCapture` (optional) | Requested only when the user sends a bug report they started from the F10 menu with "Attach a copy of the page" ticked. Chrome asks first; the copy goes in that report and nowhere else. |

## Remote code

No. Every script and stylesheet ships in the package; nothing is loaded from another
server.

## Data usage

Nothing is collected while browsing. Settings and usage counts stay in
`chrome.storage.local`; the navigation log (tui-log.js) stays in the page's memory.

Data leaves the computer only in a bug report, and only when the user presses
**Send report** in the window opened from F10 → Report a problem. The report is a zip
POSTed to the report server (`server/`, at `tui-reports.taliandeyal.workers.dev`), kept
there until the developer downloads it with `npm run pull-reports`, then deleted. It
holds:

- the user's description;
- the page's full address;
- the navigation log: the keys the extension acted on and the shape of the elements it
  moved between (tag, role, up to three class names, tabindex, position). No text,
  labels, links, ids or typed keys, unless admin mode is on;
- the extension version, the browser's version string and the window size;
- with "Attach a copy of the page" ticked (the default), an MHTML copy of the page.

So tick these categories:

| Category | Why |
| :--- | :--- |
| **Website content** | The copy of the page, which holds everything on it. |
| **Web history** | The address of the page the report is about. |
| **User activity** | The log of keys the extension acted on. |

The rest stay unticked: no account, name or email is asked for, and nothing is read
from forms, credentials or the user's location.

All three certifications still apply: no selling or transfer, no use unrelated to the
single purpose (a report is only used to fix the bug it describes), no use for credit
decisions.

## Before submitting, also check

- **Ads and affiliate links.** None.
- **Icon.** The manifest has a 128×128 icon (`src/icons/icon128.png`); the store needs it.
- **Package.** Upload the `tui-navigator-v*.zip` from the latest GitHub release. Its
  version is stamped from the tag, and each upload must be higher than the last.
