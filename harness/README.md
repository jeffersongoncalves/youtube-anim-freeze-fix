# Diagnostic harness

Loads the real extension into a Playwright-controlled Chromium against
local fixture pages, so bugs get a fast deterministic pass/fail signal
instead of "reload real YouTube/Forge and see if it feels laggy".

`sync-extension.mjs` copies the real source files into `test-extension/`
(gitignored, regenerated on every run) plus one manifest-only change:
`youtube-detector.js` also matches the local fixture server so the real
video → background → broadcast pipeline runs end to end.

## Setup (once)

```bash
bun install
bunx playwright install chromium
```

## Regression tests

```bash
bun run test
```

Runs everything in `tests/` via Bun's built-in test runner:

- `css-pause.test.js` — a plain CSS `@keyframes` spinner pauses
  (`animationPlayState === 'paused'`) while a YouTube video plays
  elsewhere, and resumes when it stops.
- `smil-pause.test.js` — an SVG `<animate>` (SMIL) spinner, which never
  sets a CSS `animation-name` and was confirmed invisible to the
  CSS-only check, actually freezes. Verified via
  `SVGSVGElement.getCurrentTime()` (the SMIL timeline clock): running at
  baseline, frozen (delta ~0s) once a video plays elsewhere.
- `noisy-container.test.js` — a container that redraws an oversized
  batch at once (mimics the Monaco editor behind Forge's deploy log)
  gets blacklisted from further scans, so a live-updating log can't
  make the scan queue grow forever.

Each test opens its own Chromium + fixture server on its own port
(8851-8853+) so they don't collide when run together.

## Jank matrix (manual diagnostic, not a pass/fail test)

```bash
bun run jank-matrix
```

Opens `video-tab.html` (a fake but really-playing `<video>`, probed via
`requestAnimationFrame` gap timing) alongside `stressor-tab.html?mode=X`
for each stress mode (`css-paint`, `css-transform`, `waapi`, `dom-big`,
`dom-small`, `combo`), with and without the extension. Prints a table:
frame count, max gap, frames >50ms/>200ms late.

Caveat found during use: this did **not** reproduce cross-tab jank for
any mode in this environment, extension on or off - the canvas-based
fake video likely doesn't exercise the real hardware video decoder path
a live YouTube video does, which may be the actual contended resource.
Treat a clean run here as "didn't get worse", not proof a real freeze is
fixed - the `tests/` suite is what actually gates regressions.

## Adding a new stress mode / test

Add a `case` in `fixtures/stressor-tab.html`'s mode switch, then either
reference it from `run.mjs`'s `MODES` array or add a new
`tests/*.test.js` using `tests/helpers.mjs` (`startFixtureServer`,
`launchWithExtension`) on its own port.
