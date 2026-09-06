// Runs on every page (incl. YouTube itself). While a YouTube video is
// playing in ANY tab, pauses infinite CSS animations that animate a
// paint-triggering property (box-shadow, filter, width, background, ...).
// Animations that only touch transform/opacity are compositor-only and
// left alone - they don't cause the contention.
//
// Deliberately narrow scope after repeated self-inflicted freezes on
// heavy, fast-mutating pages (YouTube, Forge deploy logs):
// - Only `childList` is observed, not `attributes`. Attribute churn
//   (progress bars, live class toggles) fires far more often than new
//   elements and isn't how this kind of pulse animation gets applied in
//   practice - it's set once when the element is created.
// - No `all_frames` - only the top document is scanned.
// - The keyframes-to-properties scan re-runs at most every 3s even if
//   style/link tags keep pouring in, since walking a big Tailwind
//   stylesheet on every single insertion was itself the freeze.
// - The scan queue is capped; under extreme DOM churn we skip the rest
//   of that burst rather than let the queue grow unbounded.
(function () {
  const MARK = 'yt-fix-throttled';
  const FLAG = 'yt-fix-video-elsewhere';
  const SAFE_PROPS = new Set(['transform', 'opacity']);
  const MAX_QUEUE = 3000;
  const RISKY_REFRESH_MIN_MS = 3000;
  const DEBUG = true; // temporary - remove once the freeze is confirmed fixed
  const log = (...args) => DEBUG && console.debug('[yt-fix]', ...args);

  const styleTag = document.createElement('style');
  styleTag.textContent = `html.${FLAG} .${MARK} { animation-play-state: paused !important; }`;
  document.documentElement.appendChild(styleTag);

  let riskyNames = new Set();
  let lastRiskyRefresh = 0;

  function collectRiskyNames() {
    const risky = new Set();
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // cross-origin sheet without CORS headers
      }
      if (!rules) continue;
      for (const rule of rules) {
        if (rule.type !== CSSRule.KEYFRAMES_RULE) continue;
        let safe = true;
        for (const kf of rule.cssRules) {
          for (const prop of kf.style) {
            if (!SAFE_PROPS.has(prop)) {
              safe = false;
              break;
            }
          }
          if (!safe) break;
        }
        if (!safe) risky.add(rule.name);
      }
    }
    log('keyframes scanned, risky names:', [...risky]);
    return risky;
  }

  function check(el) {
    if (!el || el.nodeType !== 1) return;
    const name = getComputedStyle(el).animationName;
    if (!name || name === 'none') return;
    if (name.split(', ').some((n) => riskyNames.has(n))) {
      if (!el.classList.contains(MARK)) log('tagged risky element', el, name);
      el.classList.add(MARK);
    }
  }

  const toCheck = [];

  // Virtualized widgets (Monaco editor, infinite-scroll logs, ...) replace
  // large chunks of their own DOM on every redraw - each redraw looked like
  // a brand new subtree needing a full scan, so a live log view re-queued
  // thousands of nodes per second forever. After a container repeats a
  // large mutation a few times, stop scanning its subtree: whatever
  // animation it has (if any) was already seen in the first couple passes.
  const NOISY_BATCH_SIZE = 200;
  const NOISY_STRIKES = 1; // blacklist on the very first oversized batch - a
  // fresh Monaco/log instance is created per deploy, so waiting for repeat
  // offenses meant paying the full scan cost again at the start of every
  // deploy, which is exactly when the freeze was reported.
  const strikes = new WeakMap();
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

  let styleChanged = false;
  let scheduled = false;

  function flush(deadline) {
    scheduled = false;
    const start = performance.now();
    const now = Date.now();
    if (styleChanged && now - lastRiskyRefresh > RISKY_REFRESH_MIN_MS) {
      riskyNames = collectRiskyNames();
      lastRiskyRefresh = now;
      styleChanged = false;
    }
    const queueLenBefore = toCheck.length;
    if (riskyNames.size) {
      processChecks(deadline);
    } else {
      toCheck.length = 0;
    }
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

  riskyNames = collectRiskyNames();
  lastRiskyRefresh = Date.now();
  enqueueSubtree(document.documentElement);
  log('initial queue size', toCheck.length);
  schedule();

  new MutationObserver((mutations) => {
    let added = 0;
    for (const m of mutations) {
      if (!m.addedNodes.length) continue;
      if (noisyParents.has(m.target)) continue;
      if (m.addedNodes.length >= NOISY_BATCH_SIZE) {
        const count = (strikes.get(m.target) || 0) + 1;
        strikes.set(m.target, count);
        if (count >= NOISY_STRIKES) {
          noisyParents.add(m.target);
          log('blacklisting noisy container after repeated large redraws', m.target);
          continue;
        }
      }
      if (isNoisy(m.target)) continue;
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        added++;
        if (node.tagName === 'STYLE' || node.tagName === 'LINK') styleChanged = true;
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
