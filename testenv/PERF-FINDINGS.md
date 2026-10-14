# Speed findings (open, to come back to)

Measured 2026-10-14 on version 0.1.100 with `node perf.js --runs 2` (see
README, "Measure how long the extension takes"). The full table is in
TESTED-SITES.md, "Timed". Nothing in src/ has been changed for this yet.

## What was found

- **Key presses are slow.** On 9 of 10 heavy sites one arrow takes the
  extension more than the 16ms of a frame on average, and up to 518ms at
  worst. Stack Overflow 318ms on average, Wikipedia 131, CNN 129, eBay 109,
  Amazon 64. Only Yahoo is within budget (16).
- **Starting in the top page is fast:** 12 to 29ms everywhere.
- **Frames add up.** Every frame (ads, widgets) loads all the content
  scripts, about 15ms each, even though its engine only starts on its first
  arrow. Stack Overflow has 49 frames: 2.5 seconds in all. BBC 18 frames,
  493ms. Each frame loads in its own process when it is from another site,
  so this does not all block the page, but it is wasted work.
- **The numbers are real, not the measurement.** On Wikipedia the timed
  copy's key times matched the long tasks Chrome reports, and the plain
  src/ build, with no timing script, showed the same long tasks
  (258, 112, 119 ... ms for ten ArrowDown).

## Where to start

1. **Wikipedia** first: one page, no frames, 100 to 250ms a key, so the
   cost is in the engine's search itself. Profile one ArrowDown there
   (Chrome DevTools Performance, or a CPU profile through CDP in tui.js) and
   see what takes the time: probably the scan of every element for targets
   (discover), getBoundingClientRect / getComputedStyle on each, forcing
   layout again and again.
2. **Stack Overflow and CNN**: the slowest keys, and the most frames.
3. **Frames**: load only a small starter script in a frame, and the rest of
   the engine on the first arrow it receives. Needs the background to inject
   the scripts (chrome.scripting) or a dynamic import; check what is allowed.
4. After each fix, `node perf.js --runs 2`, and compare with the old build
   via `--ext` on a worktree. When most sites are within budget, perf.js can
   join the regular checks.

## Budget used

Load in the top page 50ms, all frames' load 300ms, a key 16ms on average and
50ms at most, longest single piece of work 50ms (Chrome's long task). Set in
`BUDGET` in perf.js.
