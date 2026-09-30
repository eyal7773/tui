# Tested sites

Every real website the extension has been checked on, what was checked, and
where the check lives. Add a row whenever a new site is tested; update the
row when a site is retested or its scenario changes.

Scenario = `scenarios/<name>.tui`, rerun with `node suite.js`. "local page"
means the site's layout is copied into `scenarios/pages/` because the live
page needs a login or changes too often.

Started 2026-09-30 from the last 50 commits (f135756..be73518).

## With a scenario

| Site | URL tested | What was checked | Scenario | Commits |
|---|---|---|---|---|
| Amazon | amazon.com/s?k=headphones, amazon.com/dp/B09XSDMT4F | See-through `<input>` buttons, inline-link colour swatches, carousel "next slide" disappearing under the ring | amazon-result-swatches, amazon-thumbnails | 9dfa9a9, df11f9d, af9135b |
| Booking.com | booking.com | Destination field's label stealing the arrows; 1x1 "travelling for work" checkbox | booking-destination | 4edb195, bb6550e |
| eBay | ebay.com/sch/i.html?_nkw=headphones | Carousel back arrow hidden at opacity 0 over the links | ebay-hidden-carousel-arrow | e16f060 |
| GitHub | pull request diff (local page) | Review thread's buttons inside a grid cell | github-review-thread | 2f1d227 |
| Google Drive | drive.google.com (report zip + local page) | Sidebar tree with one tabindex, file grid, Enter twice opens a file | drive-new-down-home, double-enter | 864664e, 3aa87f0, 3280ca5, 9a9f926 |
| Hacker News | news.ycombinator.com | ArrowLeft from the leftmost upvote arrow climbing up | hackernews-left-edge | 83fb8f7 |
| MDN | developer.mozilla.org/.../Elements/button | Enter into a live-example iframe and back out; ring hidden before first key | mdn-frame-round-trip | f461870, 6a65389 |
| Microsoft | microsoft.com/en-us | Floating Back to Top button; stacked full-width panels | microsoft-back-to-top | ee1c3a4, c419971 |
| Stack Overflow | stackoverflow.com/questions/11227809/... | OneTrust cookie card taking focus on load | stackoverflow-first-press | 4c32c83 |
| The Verge | theverge.com | Stretched links in the story stream, staying in the column | verge-story-stream, stretched-link | 2b38ea2, be73518 |
| Wikipedia | en.wikipedia.org/wiki/Albert_Einstein, .../Python_(programming_language) | Appearance radios, Main menu Enter, page preview hover card, sticky side column | wikipedia-appearance-radios, wikipedia-main-menu-enter, wikipedia-preview-down | e9314d0, edaca2a, b42c7ec, 6e7cf43, ee1c3a4 |
| ynet | ynet.co.il | Inline link wrapping a lead photo | ynet-photo-link | 53b9229 |
| YouTube | youtube.com | Sidebar entries inside `tabindex=-1` links | youtube-sidebar | 3e98875 |

## Tested, no scenario

| Site | What was checked | Commits |
|---|---|---|
| BBC | Carousel (Recommended audio) scrolling its own box | 6a0fa37 |
| CNN | Ad iframes skipped; ring following layout shifts and late ads | 1ddd0e5, 22d89bd, 5707fd1 |
| ESPN | OneTrust cookie strip focused on load | 9c1f976 |
| Fox News | ArrowDown staying in its column across gaps between stories | 8747745 |
| Google Search | Edge-to-edge related-search chips | f135756 |
| The Guardian | Sourcepoint consent iframe; support banner pinned over the page | 82e8a29, 3e3df69, f461870 |
| IKEA | Neighbour in the same row taken as "below" | 8d02a26 |
| IMDb | Ring showing before the first key (403 page) | 6a65389 |
| MSN | Front page built from web components / shadow roots | e629c3b |
| NYTimes | Full-page bot-check iframe | f461870 |
| Target | Bot check covering the whole window | 5741640 |
| USA Today | Sideways step climbing into the pinned masthead | 839715b |
| Yahoo | `<main tabindex=-1>` taken as a stop | 8e7e2e9 |

## Dropped

| Site | Why | Commit |
|---|---|---|
| NASA | Scenario nasa-column-past-reach removed: the Earth Observatory card is gone | b24847c |
| weather.com | Scenario weather-hourly-carousel removed: hours now all shown; fixes ed6ebe1, 3dbea96 still stand | b24847c |

## Local pages only (no real site)

modal-over-page, fixed-frame-over-page, select-text, select-text-menu,
report-log, stretched-link.
