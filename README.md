# YouTube Animation Freeze Fix

Chrome/Edge extension. Fixes YouTube video freeze + buffering spinner caused by
CSS elements using `animation: 1.6s cubic-bezier(.65, 0, .35, 1) infinite editorial-pulse`
running on another part of the page. That infinite animation hogs the main
thread and starves video decode/render, causing stutter.

## What it does

While any `<video>` on youtube.com is playing, pauses (`animation-play-state: paused`)
every element whose computed `animation-name` is `editorial-pulse`. Resumes it
when the video pauses/ends.

## Install (unpacked)

1. `chrome://extensions` (or `edge://extensions`)
2. Enable "Developer mode"
3. "Load unpacked" → select this folder
4. Reload youtube.com
