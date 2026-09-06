# YouTube Animation Freeze Fix

Chrome/Edge extension (Manifest V3). Fixes YouTube video freeze + buffering
spinner caused by **any site** running a paint-heavy infinite CSS animation
(e.g. `animation: 1.6s cubic-bezier(.65, 0, .35, 1) infinite editorial-pulse`)
in another tab — reproduces the same way with dashboards, Laravel Forge
progress/status indicators, or any similar looping effect.

## Root cause

An infinite `@keyframes` animation that touches a paint-triggering property
(`box-shadow`, `filter`, `width`, `background`, ...) repaints every frame on
the main/GPU thread. That contends with video decode/compositing even in a
**different tab**, causing the freeze + loading spinner. Animations that only
use `transform`/`opacity` are compositor-only and don't cause this.

## What it does

- `youtube-detector.js` (runs on youtube.com): watches every `<video>` and
  reports play/pause state to the background worker.
- `background.js`: tracks whether any tab has a YouTube video playing, and
  broadcasts that to every open tab.
- `animation-throttle.js` (runs on every page, every frame): finds
  `@keyframes` rules that animate anything other than `transform`/`opacity`,
  tags matching elements, and pauses them (`animation-play-state: paused`)
  while a YouTube video is playing anywhere. Resumes them when it stops.

No data leaves the browser; `<all_urls>` is required only so the throttle
script can run on whatever site has the offending animation.

## Install (unpacked)

1. `chrome://extensions` (or `edge://extensions`)
2. Enable "Developer mode"
3. "Load unpacked" → select this folder
4. Reload the tabs

## License

MIT
