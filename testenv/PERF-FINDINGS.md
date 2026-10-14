# Speed findings (open, to come back to)

Measured 2026-10-14 on version 0.1.100 with `node perf.js --runs 2` (see
README, "Measure how long the extension takes"). The full table is in
TESTED-SITES.md, "Timed". Fix 1 below is in src/; the rest is not yet.

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

## The cause, from the CPU profile (2026-10-14)

`node tui.js <url> key:ArrowDown profile:ArrowDown*10` (see profile.js)
profiles ten presses with Chrome's own profiler, on src/ as it is. On both
sites almost all of a press is `refreshCandidates` (engine.js), the search
for what the ring could go to. Two different causes:

**1. Wikipedia (160ms a press): every element is checked in full, though
97% are far off screen.** The page has 6698 elements that could be targets;
226 are within reach of the screen. `discover` is cached and cheap (17ms a
press), but the filter after it (the arrow function at engine.js:2481, 140ms
a press) runs every check on all 6698: offsetParent, getBoundingClientRect,
getComputedStyle, the clip checks, textContent for "skip to" links,
closest('details'), the inert ancestors. The cheap check that drops what is
far from the screen (`withinReach`) comes near the end. Hot lines: 2487
(offsetParent), 2524-2525 (getComputedStyle), 2580-2591 (clip, textContent).
Likely fix: take the rectangle and drop what is out of reach first, before
any other check. Expected: most of the 140ms.

*Done (fix 1):* the filter now takes the rectangle and checks reach first.
Wikipedia went from 167 to 84ms a press in the profile (perf.js: 424 to 72
on average), CNN and BBC a third less; Microsoft and Amazon the same, their
time is elsewhere. What is left on Wikipedia: `rectOf` on all 6698
elements (44ms a press; `getBoundingClientRect` 22ms of it), and
`findBestCandidate`'s check of what covers each candidate
(`elementFromPoint`, 19ms). A plain `getBoundingClientRect` before `rectOf`
would be cheaper, but `rectOf` moves some boxes (a stretched link's card,
an inline link around a block picture), so that needs care.

*Done (fix 1, second part):* the window's size is read once per search,
not once per element (6ms a press); `rectOf` walks the children without
making a list of them; and what covers a candidate (`isBlocked`) is asked
of the nearest ones only, until one is clear, instead of all of them
(11ms to under 2). Wikipedia 84 to 58ms a press in the profile; with the
`timing` step and perf.js's keys, run alone, 71 to 53, the same in three
runs. The ring's path on six live sites is the same on both builds. What
is left: `getBoundingClientRect` on every element (20ms a press), which
only a way to skip elements, or to keep their boxes between presses,
would save.

perf.js runs three sites at a time, and that makes its numbers swing a
lot: in one run Wikipedia showed 140 before and 175 after, while alone it
was 71 and 53 every time. Compare builds one site at a time with the
`timing` step, or with `profile`.

**2. Stack Overflow (80ms a press): the page search is redone on every
press.** The page keeps changing (ads, animations), every change marks the
search stale, so `discover` runs each time (43ms a press). In it, the walk
of the whole DOM for shadow roots (`shadowRoots`, 23ms) and the scan of
every element's cursor style (`scanPointerTargets`, 16ms) are the cost.
Possible fixes: find shadow roots without walking every element, limit the
cursor scan to what is within reach, or redo only the part of the page that
changed.

Both are guesses about the fix until they are measured: change one, run
`profile` and `perf.js` again, and compare with the old build (`--ext` on a
worktree).

## Where to start

1. **Done:** the profile step, and the two causes above.
2. **Done:** cause 1 (filter order, window size, children, covered
   check). **Next:** cause 2 (search redone), which
   is also most of Microsoft's time; profile CNN, eBay and Amazon too.
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
