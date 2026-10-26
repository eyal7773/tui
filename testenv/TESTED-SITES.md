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
| Argo CD | resource details side panel (report zip + local page) | ArrowRight from the panel's last header button (DELETE) reaches the X that closes the panel, a button marked aria-hidden but shown and in the tab order | hidden-close-button | the commit adding hidden-close-button |
| AWS console | us-east-1.console.aws.amazon.com/ec2 Instances (local page) | Page drawn into one big frame: arrows step into it level with where they start, and back out the same way | page-frame, mdn-frame-round-trip | 78e9c88 |
| AWS access portal | awsapps.com/start accounts list (report zip + local page) | Treegrid of accounts with plain <th>/<td> cells: ArrowDown from an opened account reaches its role links (tabindex=-1) | treegrid-role-links | 63d3412 |
| Admin dashboard | an internal results list (report zip + local page) | Rows a script makes clickable, with only the pointer cursor (no link, tabindex or role): ArrowDown from the search box steps through them, Enter opens one; a submenu shown by CSS alone still reached | script-click-rows, css-only-menu | 9787f18 |
| Deploy form | an internal environments dashboard (report zip + local page) | Deploy button disabled for a moment: once enabled, ArrowRight from Cancel reaches it; a confirm box grouped with its label and a Copy button: ArrowDown from Copy rings the box, not the group, and ArrowUp returns to Copy | button-enabled-later, confirm-phrase-group | 962a1bb, 049ff25 |
| Booking.com | booking.com | Destination field's label stealing the arrows; 1x1 "travelling for work" checkbox | booking-destination | 4edb195, bb6550e |
| eBay | ebay.com/sch/i.html?_nkw=headphones (local page) | Carousel back arrow hidden at opacity 0 over the links | hidden-carousel-arrow | e16f060 |
| Gmail | open message (report zip + local page) | Message taller than the window is one focusable list item: arrows step into it, and the message's own scroll box scrolls before ArrowDown leaves for the folders | message-in-scroll-box | the commit adding the scenario |
| Gmail | open message shorter than the window (report zip + local page) | The message is a list item that does nothing itself: ArrowDown from the toolbar steps into it, to its picture and link, then on to Reply | short-message-item | the commit adding the scenario |
| GitHub | pull request diff (local page) | Review thread's buttons inside a grid cell | github-review-thread | 2f1d227 |
| GitHub | a workflow's runs (report zip + local page) | The list hands its one tab stop from row to row: ArrowDown from the first row reaches the second and on, not the sidebar | roving-list-rows | the commit adding the scenario |
| GitHub | a pull request's file tree (report zip + local page) | Open folders hold their files in a group under their own row: the ring is the row alone, ArrowDown steps through every folder and file and ArrowUp back up through them, a closed folder is stepped past | file-tree | the commit adding the scenario |
| GitHub | github.com/microsoft/vscode/pull/342492/files, signed out | File tree whose rows hold a button or a link: ArrowDown steps through folders and files; Ctrl+ArrowUp from a file goes to its folder's button, then the folder above, and at the top is a plain ArrowUp | go-inside | the commit adding Ctrl+ArrowDown/Up |
| GitHub | a repository's Code panel (report zip + local page) | Clone URL box sharing its wrapper with a copy button: ArrowRight from the box reaches the button, ArrowLeft goes back, and the button stays reachable once the box was visited | box-with-copy-button | the commit adding the scenario |
| Google Calendar | event details over the week view (report zip + local page) | Icons marked aria-hidden inside the details dialog: the arrows stay on the dialog's links instead of going to the small calendar and checkboxes behind it. ArrowRight from the side menu goes into the details (a modal in a fixed layer with no backdrop), not past them to an event down the day column behind | dialog-hidden-icons, modal-beside-tall-column | 545b204, the commit adding modal-beside-tall-column |
| Google Drive | drive.google.com (report zip + local page) | Sidebar tree with one tabindex, file grid, Enter twice opens a file | drive-new-down-home, double-enter | 864664e, 3aa87f0, 3280ca5, 9a9f926 |
| Google Sheets | a spreadsheet (report zip + local page) | Cell editor parked out of sight: once the user clicked the grid, the arrows move between cells | offscreen-cell-editor | 6a5b736 |
| Hacker News | news.ycombinator.com | ArrowLeft from the leftmost upvote arrow climbing up | hackernews-left-edge | 83fb8f7 |
| Jira | a board with an issue opened in a dialog (report zip, dialog emulated + local page) | Escape in the issue dialog or a menu closes it and the extension stays on; Escape on the page itself still hands the keyboard over | escape-closes-dialog | the commit adding the scenario |
| MDN | developer.mozilla.org/.../Elements/button | Enter into a live-example iframe and back out; ring hidden before first key | mdn-frame-round-trip | f461870, 6a65389 |
| Microsoft | microsoft.com/en-us | Floating Back to Top button; stacked full-width panels | microsoft-back-to-top | ee1c3a4, c419971 |
| OneLogin | app portal (saved page, local pages) | Grid of app tiles whose own script moves focus on an arrow press: the arrows skipped every other tile; also a tile spilling over its neighbours; the search box the portal focuses as it loads, or on ArrowUp from its tab bar, kept the arrows, so the header and profile menu were out of reach | grid-moves-focus, tile-spills-over, page-focused-search, page-focused-search-typed, arrow-moves-into-search, arrow-moves-into-search-enter | a76c0cc, 8be1edd, fe6863c, cf93f97 |
| Slack | app.slack.com client (saved page, local pages) | Sidebar `role="tree" tabindex="-1"`: ArrowLeft from a message to the channel beside it, up and down the channels; Enter on a row (direct message, channel, section heading, none of them a link) clicks its label | tree-container-tabindex, tree-item-link, tree-item-no-link | 0d14c28, 4ef722d, f2d9f90 |
| Stack Overflow | stackoverflow.com/questions/11227809/... | OneTrust cookie card taking focus on load | stackoverflow-first-press | 4c32c83 |
| Telegram Web | web.telegram.org/k a chat (report zip + local page) | Photo message is a focusable frame around the `<img>`, and the viewer opens only for a click on the picture: Enter clicks the picture; a small avatar in a text message is not taken for the message | photo-message | f6b8621 |
| Telegram Web | web.telegram.org/k a chat with a shared contact (report zip + local page) | The contact card: a role=button with no tabindex under an empty ripple layer, and MESSAGE and ADD marked by the pointer cursor alone inside the card: the arrows reach all three and Enter clicks each | contact-card | the commit adding the scenario |
| The Verge | theverge.com | Stretched links in the story stream, staying in the column | verge-story-stream, stretched-link | 2b38ea2, be73518 |
| Wikipedia | en.wikipedia.org/wiki/Albert_Einstein, .../Python_(programming_language) | Appearance radios, Main menu Enter, page preview hover card, sticky side column | wikipedia-appearance-radios, wikipedia-main-menu-enter, dialog-hidden-icons (preview card, local page) | e9314d0, edaca2a, b42c7ec, 6e7cf43, ee1c3a4 |
| ynet | ynet.co.il | Inline link wrapping a lead photo | ynet-photo-link | 53b9229 |
| YouTube | youtube.com | Sidebar entries inside `tabindex=-1` links; "Continue watching?" dialog with one button, focused by the page: the arrows enter it (report zip + local page) | youtube-sidebar, dialog-one-button | 3e98875, 6f1381f |

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
| Udemy | udemy.com; Udemy Business home (report zip + local page) | Top banner, category cards, course carousel; "My learning" menu opened over the topics row: ArrowDown enters it, not the topic hidden under it | menu-over-row | 160fbdb |
| Harvard | harvard.edu | Tall story cards, video link | - |
| MIT | mit.edu | Page CSS gave the ring a 15px margin: it sat below every element | dcefb0b |
| Stanford | stanford.edu | Story cards, video player controls | - |
| Britannica | britannica.com | Feature cards, list rows | - |
| Dictionary.com | dictionary.com | Autofocused search box keeps the arrows until Escape, by design | - |
| Goodreads | goodreads.com | Book covers in inline links, genre columns | - |
| Merriam-Webster | merriam-webster.com, /dictionary/<word> | Autofocused search box kept the arrows; rechecked 2026-10-07 after a box out of sight keeps its arrows once the user is in it | f52b150, 6a5b736 |
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
| Instagram | instagram.com | Login form, footer link rows | - |
| Facebook | facebook.com | Login form, footer language and link rows | - |
| X | x.com | Login box the page focuses: the arrows step out of it | - |
| TikTok | tiktok.com | Sidebar, video action buttons, ring following the feed as it snaps | - |
| Daily Mail | dailymail.co.uk | Lead photo in an inline link, story columns | - |
| The Independent | independent.co.uk | Membership offer over a dimmed page: ArrowDown past its last link scrolled the page behind | 21d861c |
| New York Post | nypost.com | Story columns, lead photo links | - |
| Axios | axios.com | Headline in its article's own `<header>`: ArrowRight with nothing beside it climbed into the pinned masthead | dd3dc63 |
| Vox | vox.com | Story columns, rows of cards | - |
| TIME | time.com | Section rows, newsletter buttons | - |
| HuffPost | huffpost.com | Splash story, side column, toast | - |
| BuzzFeed | buzzfeed.com | Numbered list cards, tabbed feed | - |
| Business Insider | businessinsider.com | Story columns, section labels | - |
| Investopedia | investopedia.com | Ticker frame, hero links, rate cards | - |
| MarketWatch | marketwatch.com | Subscription offer in a frame over the page is ringed; Enter steps in | - |
| Yahoo Finance | finance.yahoo.com | Consent dialog with a sticky button row over a dimmed page: ArrowDown past it scrolled the page behind | 21d861c, bf91fff |
| Politico | politico.com | Ad written by a script into a frame with no src: the ring stopped on it | f206f81 |
| Coinbase | coinbase.com | Price cards, asset rows | - |
| CoinMarketCap | coinmarketcap.com | OneTrust strip focused below the window until a scroll slides it in; then its buttons | - |
| Chase | chase.com | Full-width promo links, product cards | - |
| Bank of America | bankofamerica.com | Sign-in panel, promo rows | - |
| American Express | americanexpress.com | Card offers, rows | - |
| Shopify | shopify.com | Tabs as `span[role=tab]`, store links | - |
| Squarespace | squarespace.com | Feature tabs, slide carousel buttons | - |
| Wix | wix.com | Video hero buttons, cookie strip, sticky header menus | - |
| GoDaddy | godaddy.com | Domain search, tabbed offers, animated cards | - |
| HubSpot | hubspot.com | Chat widget in the bottom corner took ArrowDown from the pinned header | ec192dc |
| Atlassian | atlassian.com | Product cards, tabbed sections | - |
| Notion | notion.com | Customer logo row, large "Try it" cards | - |
| Figma | figma.com | Video frames, event bar pinned at the foot | - |
| Canva | canva.com | Template previews, feature cards | - |
| Trello | trello.com | Feature tabs, carousel | - |
| Asana | asana.com | Card carousel and its arrows | - |
| monday.com | monday.com | Product cards, slide buttons | - |
| Twilio | twilio.com | Consent dialog over the page keeps the ring | - |
| Stripe | stripe.com | Hero, cookie strip, product rows | - |
| Zendesk | zendesk.com | Long animated stretch: once the ring slid up behind the pinned header, ArrowDown jumped back up to the header's menu | b690cc2 |
| Docker | docker.com | OneTrust strip at the foot keeps the ring, Down scrolls the page under it | - |
| Kubernetes | kubernetes.io | Hero buttons, case study rows | - |
| React | react.dev | Code examples, video cards | - |
| Vue.js | vuejs.org | Hero, sponsor rows | - |
| Rust | rust-lang.org | Full-width buttons, section links | - |
| PHP | php.net | News column, sidebar | - |
| Kotlin | kotlinlang.org | Cookie dialog over a dimmed page keeps the ring | - |
| Microsoft Learn | learn.microsoft.com | Alert bar, link lists, footer | - |
| Google Cloud | cloud.google.com | Product accordion, floating "Ask" button | - |
| DigitalOcean | digitalocean.com | TrustArc consent strip, product cards | - |
| Heroku | heroku.com | Hero, customer rows, footer | - |
| Vercel | vercel.com | Pinned scroll-through hero with nothing to step to: Down scrolls on | - |
| Netlify | netlify.com | Animated panel with nothing to step to; floating cookie card reached with Up | - |
| JetBrains | jetbrains.com | Cookie dialog over a dimmed page keeps the ring | - |
| Visual Studio Code | code.visualstudio.com | Download dropdown button, feature links | - |
| SourceForge | sourceforge.net | Project lists, dismissable bar | - |
| Bitbucket | bitbucket.org | Video controls, content blocks | - |
| Ubuntu | ubuntu.com | Product cards, full-width links | - |
| Debian | debian.org | News column, "More..." links | - |
| Go | go.dev | Closed menu drawer's link at exactly the window's right edge took ArrowRight off the page | 02fddcf |
| Fandom | fandom.com | Wiki cards, trending rows | - |
| wikiHow | wikihow.com | Article cards, closable bar | - |
| Quizlet | quizlet.com | Ketch consent card over a dimmed page keeps the ring | - |
| Duolingo | duolingo.com | Long animated stretch: Down scrolls on to the app store buttons | - |
| TED | ted.com | Talk cards, rows | - |
| Mayo Clinic | mayoclinic.org | Link lists, language button | - |
| WebMD | webmd.com | Topic lists, story cards | - |
| NHS | nhs.uk | Full-width service links | - |
| Allrecipes | allrecipes.com | Recipe card rows | - |
| Food Network | foodnetwork.com | Newsletter modal keeps the ring | - |
| Serious Eats | seriouseats.com | Full-width lead photo link, card rows | - |
| trivago | trivago.com | Search form, deal rows | - |
| Agoda | agoda.com | Search form, promo cards | - |
| United | united.com | Booking form, ad card rows | - |
| Delta | delta.com | OneTrust banner that focuses itself: the arrows step into it | - |
| Southwest | southwest.com | Booking panel, feedback tab pinned on the right | - |
| Uber | uber.com | City buttons, carousel arrows | - |
| Lyft | lyft.com | Hero buttons, product sections | - |
| Healthline | healthline.com | Closed menu kept inert over the page: ArrowDown spent every try on its buttons and the ring never moved | 75b9789 |
| Instacart | instacart.com | Store cards, delivery rows | - |
| Walgreens | walgreens.com | Promo rows, footer | - |
| Ulta Beauty | ulta.com | Category rows, product carousels | - |
| Gap | gap.com | Full-window promo links, slide arrows | - |
| ASOS | asos.com | Search box its page focuses when the ring arrives kept every arrow; search mode then dims the page | 09521b0, 9cd33e2 |
| Nordstrom | nordstrom.com | Page rewrites its document after load now and then: the arrows stopped working | 1a707d9 |
| Zalando | zalando.com | Country chooser, footer links | - |
| Newegg | newegg.com | Deal rows, category menu | - |
| B&H | bhphotovideo.com | Hero tiles, Shop Now buttons | - |
| Lenovo | lenovo.com | Cookie dialog over a dimmed page keeps the ring | - |
| ASUS | asus.com | Large product tiles | - |
| Logitech | logitech.com | Product rows | - |
| Sony | sony.com | Story rows | - |
| PlayStation | playstation.com | Full-width banner, carousel buttons | - |
| Xbox | xbox.com | Game Pass tiles, console links | - |
| LG | lg.com | Body positioned 124px down: every ring sat 124px below its element (right-to-left edition) | 42709c9 |
| Nintendo | nintendo.com | Region chooser, game tiles | - |
| EA | ea.com | TrustArc consent strip, game tiles | - |
| Roblox | roblox.com | Login header, language combobox at the foot | - |
| Chess.com | chess.com | Sidebar, Get Started buttons | - |
| Lichess | lichess.org | Game lobby, side links | - |
| ESPNcricinfo | espncricinfo.com | Story rows, score cards | - |
| Goal | goal.com | Story cards, match strip | - |
| Bleacher Report | bleacherreport.com | Score strip, story cards shifting as the page loads | - |
| FIFA | fifa.com | OneTrust consent card over a dimmed page keeps the ring | - |
| Formula 1 | formula1.com | Consent dialog in a frame over the whole window: ArrowDown past its last button left no ring anywhere | 9252eff |
| Crunchyroll | crunchyroll.com | Hero carousel, series rows | - |
| Time and Date | timeanddate.com | Tool tiles, link rows | - |
| Kickstarter | kickstarter.com | Project cards in rows, category menu | - |
| Patreon | patreon.com | Long animated stretch: Down scrolls on to the next section | - |
| Olympics | olympics.com | Modal consent card that focuses its own link: the press that stayed on it drew no ring | d9486bc |

## Timed

`node perf.js --runs 2` on 2026-10-14 (version 0.1.100): how long the
extension takes, in ms. `!` is over budget (load 50, frames 300, a key 16 on
average and 50 at most, longest single run 50).

| Site | Frames | Load | Frames' load | Key avg | Key max | Longest |
|---|---|---|---|---|---|---|
| Amazon (s?k=headphones) | 3 | 12 | 12 | 64! | 150! | 150! |
| YouTube | 1 | 25 | 0 | 20! | 44 | 44 |
| Yahoo | 1 | 20 | 0 | 16 | 38 | 38 |
| Booking.com | 5 | 19 | 27 | 57! | 142! | 142! |
| eBay (search) | 17 | 17 | 111 | 109! | 227! | 227! |
| CNN | 33 | 25 | 314! | 129! | 242! | 241! |
| BBC News | 18 | 24 | 493! | 39! | 110! | 110! |
| Microsoft | 4 | 29 | 27 | 57! | 101! | 101! |
| Stack Overflow (question) | 49 | 20 | 2527! | 318! | 518! | 518! |
| Wikipedia (United_States) | 1 | 15 | 0 | 131! | 250! | 250! |

After the candidate filter checks reach first (see PERF-FINDINGS.md, cause
1), the old and new builds measured one after the other, same day. Live
sites vary from run to run; the CPU profile (`profile:ArrowDown*10`) is the
steadier number.

| Site | Key avg before | Key avg after | Profile, ms a press |
|---|---|---|---|
| Wikipedia (United_States) | 424 | 72 | 167 → 84 |
| CNN | 161 | 109 | |
| BBC News | 43 | 27 | |
| Microsoft | 100 | 119 | 51 → 55 (same) |
| Amazon (s?k=headphones) | 90 | 104 | 31 → 32 (same) |
| Stack Overflow (question) | 182 | 182 | |

Then the window's size read once, and what covers a candidate asked of the
nearest only (PERF-FINDINGS.md, fix 1, second part). Wikipedia, perf.js's
keys with the `timing` step, run alone three times on each build: 71 to 53
a press on average; profile 84 to 58.

Then a class or style change rescans only the box it changed in
(PERF-FINDINGS.md, fix 2). Profile, ms a press, before → after: Stack
Overflow 68 → 31, Microsoft 50 → 35, CNN 60 → 42, YouTube 17 → 10, GitHub
(microsoft/vscode) 32 → 22; Amazon, BBC, Wikipedia unchanged. Same ring path
on both builds on Microsoft, CNN, YouTube, BBC, Wikipedia, GitHub and Amazon.

## Blocked (not counted)

Answered the harness with a bot check, so the page itself was never seen:
Etsy, Yelp, Ars Technica, NIH (Cloudflare check), Al Jazeera (connection timed out), Oracle (error page), Adidas (bot block), Macy's (access denied), Zillow (captcha), AliExpress (reCAPTCHA), The Telegraph (access denied), The Economist (human check), Skyscanner (captcha), DoorDash (Cloudflare check), Kroger (too many requests), Uniqlo (access denied), CVS (US only), Letterboxd (security check), Genius (human check).

## Tested, no scenario

| Site | What was checked | Commits |
|---|---|---|
| BBC | Carousel (Recommended audio) scrolling its own box | 6a0fa37 |
| CNN | Ad iframes skipped; ring following layout shifts and late ads | 1ddd0e5, 22d89bd, 5707fd1 |
| ESPN | OneTrust cookie strip focused on load | 9c1f976 |
| Fox News | ArrowDown staying in its column across gaps between stories | 8747745 |
| Wikipedia | Shift+ArrowDown scrolling the article 40px a press, the ring staying on the main menu button | the commit adding Shift+arrow scrolling |
| ynet, Wikipedia, CNN, YouTube, GitHub | The Shift+arrow scroll cue drawn by the right edge in the ring's colour, page CSS not changing it (YouTube logged out has nothing to scroll: the bump); the Esc switch on Wikipedia and ynet | the commit adding the scroll and Esc cues |
| Google, Amazon, Wikipedia | Search box reached by arrows: the plain ring on arrival, the ring hugging the box after Enter and while typing, plain again after Esc (ASOS, the box the page focuses itself, answers Access Denied: covered by edit-look) | the commit adding the in-a-box ring |
| Gemini | ArrowRight from the chat box's row does not climb to the buttons in the top-right corner: Right stays on its row by design; ArrowUp to the top row, then Right, reaches them | - |
| Google Search | Edge-to-edge related-search chips | f135756 |
| The Guardian | Sourcepoint consent iframe; support banner pinned over the page | 82e8a29, 3e3df69, f461870 |
| IKEA | Neighbour in the same row taken as "below" | 8d02a26 |
| IMDb | Ring showing before the first key (403 page) | 6a65389 |
| MSN | Front page built from web components / shadow roots | e629c3b |
| NYTimes | Full-page bot-check iframe | f461870 |
| Target | Bot check covering the whole window | 5741640 |
| USA Today | Sideways step climbing into the pinned masthead | 839715b |
| Yahoo | `<main tabindex=-1>` taken as a stop | 8e7e2e9 |
| vscode.dev | Shift+F10 on a title-bar and a sidebar button opens VS Code's own right-click menu at the button (the page took the made-up right-click), the arrows step through it, Esc closes it and the ring is back on the button with the keyboard kept | the commit adding Shift+F10 |
| TimeWatch | Attendance page (report zip): Enter on a link with no href that a script handles did nothing visible. Not reproduced: the page needs a login, and the saved copy holds none of the scripts that handle the link | - |
| Coralogix | Logs explorer (report zip): ArrowDown from a toolbar button scrolled the logs box. Not reproduced: the page needs a login and its saved copy lays out differently without the app's scripts | - |

## Dropped

| Site | Why | Commit |
|---|---|---|
| NASA | Scenario nasa-column-past-reach removed: the Earth Observatory card is gone | b24847c |
| weather.com | Scenario weather-hourly-carousel removed: hours now all shown; fixes ed6ebe1, 3dbea96 still stand | b24847c |

## Local pages only (no real site)

modal-over-page, fixed-frame-over-page, select-text, select-text-menu,
report-log, stretched-link, shift-scroll, restyled-pointer, cues, menu-order, edit-look, escape-pulled-box,
context-menu, go-inside.
