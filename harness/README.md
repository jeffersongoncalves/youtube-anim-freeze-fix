# Diagnostic harness

Loads the real extension into a Playwright-controlled Chromium against
local fixture pages, so bugs get a fast deterministic pass/fail signal
instead of "reload real YouTube/Forge and see if it feels laggy".

`sync-extension.mjs` copies the real source files into `test-extension/`
(plus one manifest-only change: `youtube-detector.js` also matches the
local fixture server so the real video → background → broadcast pipeline
runs end to end) — it runs automatically at the top of every script here.

## Setup (once)

```bash
bun install
bunx playwright install chromium
```

## Scripts

- `bun run run.mjs` — jank matrix: opens `video-tab.html` (a fake but
  really-playing `<video>`, probed via `requestAnimationFrame` gap
  timing) alongside `stressor-tab.html?mode=X` for each stress mode
  (`css-paint`, `css-transform`, `waapi`, `dom-big`, `dom-small`, `combo`),
  with and without the extension. Printed as a table: frame count, max
  gap, frames >50ms/>200ms late.

  Caveat found during use: this did **not** reproduce cross-tab jank for
  any mode in this environment, extension on or off - the canvas-based
  fake video likely doesn't exercise the real hardware video decoder
  path a live YouTube video does, which may be the actual contended
  resource. Treat a clean run here as "didn't get worse", not proof the
  real freeze is fixed - confirm on the real sites too.

- `bun run check-smil.mjs` — functional check for SMIL (`<animate>`)
  animations, which don't set a CSS `animation-name` and were confirmed
  invisible to `check()`: reads the animated SVG's `getCurrentTime()`
  timeline clock before/after a video starts playing elsewhere. A
  working fix shows the clock advancing at baseline and frozen (delta
  ~0s) once `yt-fix-video-elsewhere` is set.

## Adding a new stress mode

Add a `case` in `fixtures/stressor-tab.html`'s mode switch, then reference
it from `run.mjs`'s `MODES` array or a dedicated check script like
`check-smil.mjs`.
