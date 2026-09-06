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

  function scan(root) {
    check(root);
    root.querySelectorAll?.('*').forEach(check);
  }

  function refreshAndScan() {
    riskyNames = collectRiskyNames();
    if (riskyNames.size) scan(document.documentElement);
  }

  refreshAndScan();

  new MutationObserver((mutations) => {
    let styleAdded = false;
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.tagName === 'STYLE' || node.tagName === 'LINK') styleAdded = true;
          scan(node);
        });
      } else {
        check(m.target);
      }
    }
    if (styleAdded) refreshAndScan();
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
