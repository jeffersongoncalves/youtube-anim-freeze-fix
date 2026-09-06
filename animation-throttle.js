// Runs on every page (incl. YouTube itself). While a YouTube video is
// playing in ANY tab, pauses every infinite CSS animation on the page.
//
// Earlier versions only paused animations that touched a paint-triggering
// property (box-shadow, filter, width, ...) and left transform/opacity
// animations alone, assuming those are compositor-only and harmless. Real
// testing (a plain `transform: rotate` spinner on github.com) showed that
// assumption doesn't hold - any sustained animation loop can compete for
// GPU/compositor time with video playback elsewhere. So this no longer
// tries to classify animations by property at all: any element with a
// non-'none' animation-name gets paused. That also removes the entire
// CSSOM keyframes-property scan, which was itself the source of several
// earlier freezes (walking every stylesheet's every rule on a big Tailwind
// bundle).
//
// Deliberately narrow scope after repeated self-inflicted freezes on
// heavy, fast-mutating pages (YouTube, Forge deploy logs):
// - Only `childList` is observed, not `attributes`. Attribute churn
//   (progress bars, live class toggles) fires far more often than new
//   elements and isn't how this kind of pulse animation gets applied in
//   practice - it's set once when the element is created.
// - No `all_frames` - only the top document is scanned.
// - The scan queue is capped; under extreme DOM churn we skip the rest
//   of that burst rather than let the queue grow unbounded.
(function () {
  const MARK = 'yt-fix-throttled';
  const FLAG = 'yt-fix-video-elsewhere';
  const MAX_QUEUE = 3000;
  const DEBUG = false; // flip to true + reload for [yt-fix]-prefixed console diagnostics
  const log = (...args) => DEBUG && console.debug('[yt-fix]', ...args);

  const styleTag = document.createElement('style');
  styleTag.textContent = `html.${FLAG} .${MARK} { animation-play-state: paused !important; }`;
  document.documentElement.appendChild(styleTag);

  function check(el) {
    if (!el || el.nodeType !== 1) return;
    const name = getComputedStyle(el).animationName;
    if (!name || name === 'none') return;
    if (!el.classList.contains(MARK)) log('tagged animated element', el, name);
    el.classList.add(MARK);
  }

  const toCheck = [];

  // Virtualized widgets (Monaco editor, infinite-scroll logs, ...) replace
  // large chunks of their own DOM on every redraw - each redraw looked like
  // a brand new subtree needing a full scan, so a live log view re-queued
  // thousands of nodes per second forever. After a container has one
  // oversized redraw, stop scanning its subtree: whatever animation it has
  // (if any) was already seen in that first pass.
  const NOISY_BATCH_SIZE = 200;
  const noisyParents = new WeakSet();

  function isNoisy(parent) {
    for (let n = parent; n; n = n.parentElement) {
      if (noisyParents.has(n)) return true;
    }
    return false;
  }

  function enqueueSubtree(root) {
    if (!root || toCheck.length >= MAX_QUEUE) return;
    toCheck.push(root);
    root.querySelectorAll?.('*').forEach((el) => {
      if (toCheck.length < MAX_QUEUE) toCheck.push(el);
    });
  }

  function processChecks(deadline) {
    while (toCheck.length) {
      check(toCheck.pop());
      if (deadline && deadline.timeRemaining() <= 0) break;
    }
  }

  let scheduled = false;

  function flush(deadline) {
    scheduled = false;
    const start = performance.now();
    const queueLenBefore = toCheck.length;
    processChecks(deadline);
    const took = performance.now() - start;
    if (took > 16) log(`flush took ${took.toFixed(1)}ms, checked ${queueLenBefore - toCheck.length}/${queueLenBefore}, ${toCheck.length} left`);
    if (toCheck.length) schedule(); // ran out of idle time - finish next slice
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    const idle = window.requestIdleCallback || ((cb) => setTimeout(() => cb({ timeRemaining: () => 5, didTimeout: true }), 300));
    idle(flush, { timeout: 1000 });
  }

  enqueueSubtree(document.documentElement);
  log('initial queue size', toCheck.length);
  schedule();

  new MutationObserver((mutations) => {
    let added = 0;
    for (const m of mutations) {
      if (!m.addedNodes.length) continue;
      if (noisyParents.has(m.target)) continue;
      if (m.addedNodes.length >= NOISY_BATCH_SIZE) {
        noisyParents.add(m.target);
        log('blacklisting noisy container after an oversized redraw', m.target);
        continue;
      }
      if (isNoisy(m.target)) continue;
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        added++;
        enqueueSubtree(node);
      });
    }
    if (added > 50) log(`mutation batch added ${added} nodes, queue now ${toCheck.length}`);
    schedule();
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Orphaned instance from before an extension reload - chrome.runtime is
  // gone and this tab can't be reached anymore; only a full page reload
  // gets it a working context again.
  chrome.runtime?.onMessage?.addListener((msg) => {
    if (msg?.type === 'yt-playing-changed') {
      log('yt-playing-changed', msg.playing);
      document.documentElement.classList.toggle(FLAG, !!msg.playing);
    }
  });
})();
