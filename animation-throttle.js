// Runs on every page (incl. YouTube itself). While a YouTube video is
// playing in ANY tab, pauses infinite CSS animations that animate a
// paint-triggering property (box-shadow, filter, width, background, ...).
// Animations that only touch transform/opacity are compositor-only and
// left alone - they don't cause the contention.
(function () {
  const MARK = 'yt-fix-throttled';
  const FLAG = 'yt-fix-video-elsewhere';
  const SAFE_PROPS = new Set(['transform', 'opacity']);

  const styleTag = document.createElement('style');
  styleTag.textContent = `html.${FLAG} .${MARK} { animation-play-state: paused !important; }`;
  document.documentElement.appendChild(styleTag);

  let riskyNames = new Set();

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
    return risky;
  }

  function check(el) {
    if (!el || el.nodeType !== 1) return;
    const name = getComputedStyle(el).animationName;
    if (!name || name === 'none') return;
    if (name.split(', ').some((n) => riskyNames.has(n))) {
      el.classList.add(MARK);
    }
  }

  // Everything that still needs a getComputedStyle check. Populated in bulk
  // (querySelectorAll only - cheap) but drained through processChecks()
  // which respects the browser's idle time budget, so a page that dumps a
  // huge subtree at once (a big Livewire re-render, a streamed deploy log
  // on Forge) can't force one giant synchronous style-recalc pass - that's
  // literally what froze the tab before.
  const toCheck = [];

  function enqueueSubtree(root) {
    if (!root) return;
    toCheck.push(root);
    root.querySelectorAll?.('*').forEach((el) => toCheck.push(el));
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
    if (styleChanged) {
      riskyNames = collectRiskyNames();
      styleChanged = false;
    }
    if (riskyNames.size) {
      processChecks(deadline);
    } else {
      toCheck.length = 0;
    }
    if (toCheck.length) schedule(); // ran out of idle time - finish next slice
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    const idle = window.requestIdleCallback || ((cb) => setTimeout(() => cb({ timeRemaining: () => 5, didTimeout: true }), 300));
    idle(flush, { timeout: 1000 });
  }

  riskyNames = collectRiskyNames();
  enqueueSubtree(document.documentElement);
  schedule();

  new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.tagName === 'STYLE' || node.tagName === 'LINK') styleChanged = true;
          enqueueSubtree(node);
        });
      } else {
        // attribute change: only the target itself needs re-checking, not
        // its subtree - descendants' own animations aren't affected by an
        // ancestor's class/style flip.
        toCheck.push(m.target);
      }
    }
    schedule();
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style'],
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'yt-playing-changed') {
      document.documentElement.classList.toggle(FLAG, !!msg.playing);
    }
  });
})();
