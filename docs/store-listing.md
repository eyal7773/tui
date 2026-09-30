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
| Host access (content script on `<all_urls>`) | The arrow keys have to work on whatever page the user is on. |
| `storage` | The user's settings (ring colour, excluded sites, motion) and local usage counts for the stats page. |
| `activeTab` | The popup shows and changes the setting for the site in the current tab. |
| `notifications`, `alarms` | The weekly recap notification, which the user can turn off. |
| `pageCapture` (optional) | Requested only when the user ticks "Include a copy of the page" in a bug report they started from the F10 menu. The copy is saved to their own downloads; nothing is sent. |

## Data usage

Nothing is collected: no data leaves the user's computer through the extension.

- Settings and usage counts stay in `chrome.storage.local`.
- The navigation log (tui-log.js) stays in the page's memory, holds the last 20 events,
  and records element shape only: tag, role, up to three class names, tabindex,
  position. No text, labels, links, ids or typed keys.
- A bug report is a zip the user saves and chooses to attach to a GitHub issue. The
  report window shows its whole content first. A copy of the page is off by default.

So every "Data usage" category is left unticked, and all three certifications apply:
no selling, no use unrelated to the single purpose, no use for credit decisions.

## Before submitting, also check

- **Remote code.** None: every script ships in the package. The stats page loads only a
  stylesheet from `cdn.jsdelivr.net`; bundling it would remove the one outside request.
- **Ads and affiliate links.** None.
