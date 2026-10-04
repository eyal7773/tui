# Tested sites

Every real website the extension has been checked on, what was checked, and
where the check lives. Add a row whenever a new site is tested; update the
row when a site is retested or its scenario changes.

Scenario = `scenarios/<name>.tui`, rerun with `node suite.js`. "local page"
means the site's layout is copied into `scenarios/pages/` because the live
page needs a login or changes too often.

Started 2026-09-30 from the last 50 commits (f135756..be73518).

"Surveyed" sites were walked with `node survey.js <url>` (8 × ArrowDown,
Right, Left, Down, Up from the first press) and the trace and screenshots
read by hand. A site is listed once the walk looked right, after any fix
and a recheck.

## With a scenario

| Site | URL tested | What was checked | Scenario | Commits |
|---|---|---|---|---|
| Amazon | amazon.com/s?k=headphones, amazon.com/dp/B09XSDMT4F | See-through `<input>` buttons, inline-link colour swatches, carousel "next slide" disappearing under the ring | amazon-result-swatches, amazon-thumbnails | 9dfa9a9, df11f9d, af9135b |
| Argo CD | argocd application tree (report zip + local page) | Menu opened from a node's three-dots button, pinned under it outside the scrolling tree: ArrowDown enters it | menu-opened-from-button | 3aca213 |
| AWS console | us-east-1.console.aws.amazon.com/ec2 Instances (local page) | Page drawn into one big frame: arrows step into it level with where they start, and back out the same way | page-frame, mdn-frame-round-trip | 78e9c88 |
| Booking.com | booking.com | Destination field's label stealing the arrows; 1x1 "travelling for work" checkbox | booking-destination | 4edb195, bb6550e |
| eBay | ebay.com/sch/i.html?_nkw=headphones | Carousel back arrow hidden at opacity 0 over the links | ebay-hidden-carousel-arrow | e16f060 |
| Gmail | open message (report zip + local page) | Message taller than the window is one focusable list item: arrows step into it, and the message's own scroll box scrolls before ArrowDown leaves for the folders | message-in-scroll-box | the commit adding the scenario |
| GitHub | pull request diff (local page) | Review thread's buttons inside a grid cell | github-review-thread | 2f1d227 |
| Google Drive | drive.google.com (report zip + local page) | Sidebar tree with one tabindex, file grid, Enter twice opens a file | drive-new-down-home, double-enter | 864664e, 3aa87f0, 3280ca5, 9a9f926 |
| Hacker News | news.ycombinator.com | ArrowLeft from the leftmost upvote arrow climbing up | hackernews-left-edge | 83fb8f7 |
| MDN | developer.mozilla.org/.../Elements/button | Enter into a live-example iframe and back out; ring hidden before first key | mdn-frame-round-trip | f461870, 6a65389 |
| Microsoft | microsoft.com/en-us | Floating Back to Top button; stacked full-width panels | microsoft-back-to-top | ee1c3a4, c419971 |
| OneLogin | app portal (log only, local page) | Grid of app tiles: the focused tile spills over its neighbours, and the arrows skipped every other tile | tile-spills-over | a76c0cc |
| Slack | app.slack.com client (local page) | Sidebar `role="tree" tabindex="-1"`: ArrowLeft from a message to the channel beside it, up and down the channels | tree-container-tabindex | 0d14c28 |
| Stack Overflow | stackoverflow.com/questions/11227809/... | OneTrust cookie card taking focus on load | stackoverflow-first-press | 4c32c83 |
| The Verge | theverge.com | Stretched links in the story stream, staying in the column | verge-story-stream, stretched-link | 2b38ea2, be73518 |
| Wikipedia | en.wikipedia.org/wiki/Albert_Einstein, .../Python_(programming_language) | Appearance radios, Main menu Enter, page preview hover card, sticky side column | wikipedia-appearance-radios, wikipedia-main-menu-enter, wikipedia-preview-down | e9314d0, edaca2a, b42c7ec, 6e7cf43, ee1c3a4 |
| ynet | ynet.co.il | Inline link wrapping a lead photo | ynet-photo-link | 53b9229 |
| YouTube | youtube.com | Sidebar entries inside `tabindex=-1` links | youtube-sidebar | 3e98875 |

## Surveyed

| Site | URL | What was seen | Fix |
|---|---|---|---|
| Reddit | reddit.com | Feed, sign-in column, sidebar and footer reachable; rows kept | - |
| LinkedIn | linkedin.com | First press started at a floating "better on the app" card first in the markup | b513058 |
| Pinterest | pinterest.com | ArrowLeft from a form field scrolled 500px to the footer | 37a6d23 |
| Twitch | twitch.tv | Sidebar channels, player controls | - |
| Apple | apple.com | Promo tiles' Learn more / Buy pairs | - |
| Best Buy | bestbuy.com | Country chooser (served outside the US) | - |
| Tripadvisor | tripadvisor.com | Card carousels, rows of tours | - |
| The Washington Post | washingtonpost.com | Story columns, bylines | - |
| Walmart | walmart.com | Sparky assistant button trapped ArrowDown; Right climbed off screen; re-rendered links sent the step to the top | f08e260, 37a6d23, ab5afa3 |
| Reuters | reuters.com | Consent banner over a dimmed page: arrows reached stories behind it | 52db998 |
| AP News | apnews.com | Consent dialog that focuses itself: the ring never got in | 59dcd16 |
| NPR | npr.org | Consent banner over a dimmed page keeps the ring | - |
| CNBC | cnbc.com | Consent banner keeps the ring | - |
| Bloomberg | bloomberg.com | Story columns, chart iframe | - |
| NBC News | nbcnews.com | Lead story, story grid | - |
| CBS News | cbsnews.com | Story cards, rows | - |
| Wired | wired.com | Story grid, section links | - |
| TechCrunch | techcrunch.com | Story list, bylines | - |
| Craigslist | newyork.craigslist.org | Category columns (slow to render: give it 5 s) | - |
| LA Times | latimes.com | Focus on an empty dialog at the page's foot; a floating terms dialog did not hide the link behind it | 5409cda |
| The Atlantic | theatlantic.com | Story columns, bylines, rows | - |
| CNET | cnet.com | Newsletter widget in an about:blank frame is ringed; Enter steps in | - |
| ZDNet | zdnet.com | Story list, lead story | - |
| Medium | medium.com | Landing page, footer | - |
| Quora | quora.com | Login page autofocuses its email box: the arrows stay in the box until Escape, by design | - |
| DEV Community | dev.to | Sidebar, story cards | - |
| W3Schools | w3schools.com | Tabs, course cards, rows | - |
| Python | python.org | News lists, "Use Python for" link rows | - |
| Node.js | nodejs.org | Hero buttons, footer rows | - |
| npm | npmjs.com | Landing page, footer columns | - |
| GitLab | about.gitlab.com | Logo row, CTA sections, AI chat widget | - |
| Internet Archive | archive.org | Search, collection carousels | - |
| Forbes | forbes.com | First press started from a link parked off the right edge | d840f9e |
| National Geographic | nationalgeographic.com | Story list, card row | - |
| Khan Academy | khanacademy.org | Cookie card that declares itself modal keeps the first press; course grid | - |
| Coursera | coursera.org | Hero carousel dots, course cards | - |
| Udemy | udemy.com | Top banner, category cards, course carousel | - |
| Harvard | harvard.edu | Tall story cards, video link | - |
| MIT | mit.edu | Page CSS gave the ring a 15px margin: it sat below every element | dcefb0b |
| Stanford | stanford.edu | Story cards, video player controls | - |
| Britannica | britannica.com | Feature cards, list rows | - |
| Dictionary.com | dictionary.com | Autofocused search box keeps the arrows until Escape, by design | - |
| Goodreads | goodreads.com | Book covers in inline links, genre columns | - |
| Merriam-Webster | merriam-webster.com | Autofocused search box out of sight kept the arrows | f52b150 |
| Rotten Tomatoes | rottentomatoes.com | First press went to a card half off the edge, behind the cookie backdrop | f52b150 |
| Metacritic | metacritic.com | Score cards, video list | - |
| IGN | ign.com | Right-to-left edition: sidebar, feature cards | - |
| GameSpot | gamespot.com | Feed tabs, story list | - |
| Steam | store.steampowered.com | Hero carousel, deal cards | - |
| Epic Games Store | store.epicgames.com | Autofocused search box keeps the arrows until Escape, by design | - |
| NFL | nfl.com | Consent banner over a dimmed page keeps the ring | - |
| NBA | nba.com | Story list, media-day button row | - |
| MLB | mlb.com | Consent banner over a dimmed page keeps the ring | - |
| Sky Sports | skysports.com | Full-window consent frame is ringed; Enter steps in | - |
| DW | dw.com | Consent dialog with a scrolling list of purposes | - |
| Le Monde | lemonde.fr | Consent wall of links without an href: focus stayed on the body, ring round the whole page | de74588 |
| Der Spiegel | spiegel.de | Full-window consent frame is ringed; Enter steps in | - |
| GOV.UK | gov.uk | Cookie banner, service links, topic list | - |
| USA.gov | usa.gov | Topic cards in rows, Back to top | - |
| CDC | cdc.gov | A–Z letter grid, feature links | - |
| WHO | who.int | News cards, "Read more" link rows | - |
| United Nations | un.org | Language chooser | - |
| Adobe | adobe.com | Product tabs, carousels, plan links | - |
| Dropbox | dropbox.com | CTA sections, animation toggle | - |
| Slack | slack.com | Feature tabs, update carousel | - |
| Zoom | zoom.us | Product cards, tabs, video controls | - |
| Salesforce | salesforce.com | Carousels, video testimonials, chat widget | - |
| IBM | ibm.com | Link cards, contact form fields | - |
| Samsung | samsung.com/us | Cookie dialog over a dimmed page keeps the ring | - |
| Dell | dell.com | Category carousel; Down leaves the cookie strip for the page | 0b09cc6 |
| HP | hp.com | Right-to-left edition: cookie dialog, product rows | - |
| Nike | nike.com | Hero "Shop" links, shoe-icon rows | - |
| Zara | zara.com/us | Cookie modal keeps the ring | - |
| H&M | hm.com | Category tiles taller than the window | - |
| Sephora | sephora.com | Country-choice modal keeps the ring | - |
| PayPal | paypal.com | Down from the cookie strip only scrolled the page; from the page it went back to the strip | 0b09cc6 |
| Wayfair | wayfair.com | Promo strip, product rows | - |
| Hotels.com | hotels.com | Search form, business-travel checkbox, footer | - |
| National Weather Service | weather.gov | Forecast forms, alert links | - |
| AccuWeather | accuweather.com | Cookie box over a dimmed page keeps the ring | - |
| OpenAI | openai.com | Story cards, "View more" rows | - |
| Anthropic | anthropic.com | Feature cards taller than the window, model links | - |
| Mozilla | mozilla.org | Full-width product rows | - |
| WordPress.com | wordpress.com | Theme carousel, FAQ summaries | - |
| Tumblr | tumblr.com | Consent dialog in a frame over a dimmed page is ringed; Enter steps in | - |
| Vimeo | vimeo.com | Scroll-animated cards | - |
| SoundCloud | soundcloud.com | Cookie banner over a dimmed page keeps the ring | - |
| Bandcamp | bandcamp.com | Cookie dialog keeps the ring | - |
| Discord | discord.com | Long stretches with nothing to step to: Down scrolls on | - |
| Imgur | imgur.com | Masonry post grid, Move to the top | - |
| The Home Depot | homedepot.com | Promo banners, category tiles | - |
| Lowe's | lowes.com | Flyout menu buttons, filter chips (slow to load) | - |
| Costco | costco.com | Header, promo carousel, newsletter form | - |
| KAYAK | kayak.com | Search form, deal lists | - |
| Expedia | expedia.com | Search form, deal cards, footer | - |
| Airbnb | airbnb.com | Listing rows, tabbed link sections | - |
| DuckDuckGo | duckduckgo.com | Autofocused search box keeps the arrows until Escape, by design | - |
| Bing | bing.com | Autofocused search box keeps the arrows until Escape, by design | - |
| Spotify | open.spotify.com | Sidebar, playlist rows (grid rows) | - |
| Netflix | netflix.com | Title cards, FAQ accordion | - |
| Wolfram Alpha | wolframalpha.com | Autofocused input keeps the arrows until Escape, by design | - |
| Cloudflare | cloudflare.com | Animated hero pulled every scroll back to its button; after scrolling, Down started above the window | 0bfa451 |

## Blocked (not counted)

Answered the harness with a bot check, so the page itself was never seen:
Etsy, Yelp, Ars Technica, NIH (Cloudflare check), Al Jazeera (connection timed out), Oracle (error page), Adidas (bot block), Macy's (access denied), Zillow (captcha).

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
