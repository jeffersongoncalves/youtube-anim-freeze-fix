// Pauses any element running the "editorial-pulse" CSS animation while a
// YouTube <video> is playing. That infinite animation runs on the main
// thread; while it fights with video decode/render it causes freezes and
// the buffering spinner.
(function () {
  const MARK = 'yt-fix-editorial-pulse';
  const FLAG = 'yt-fix-video-playing';
  const TARGET_ANIMATION = 'editorial-pulse';

  const style = document.createElement('style');
  style.textContent = `html.${FLAG} .${MARK} { animation-play-state: paused !important; }`;
  document.documentElement.appendChild(style);

  function check(el) {
    if (!el || el.nodeType !== 1) return;
    const names = getComputedStyle(el).animationName;
    if (names && names.split(', ').includes(TARGET_ANIMATION)) {
      el.classList.add(MARK);
    }
  }

  function scan(el) {
    check(el);
    el.querySelectorAll?.('*').forEach(check);
  }

  function hookVideo(video) {
    if (video.dataset.ytFixHooked) return;
    video.dataset.ytFixHooked = '1';
    const update = () =>
      document.documentElement.classList.toggle(FLAG, !video.paused && !video.ended);
    ['play', 'playing', 'pause', 'ended', 'waiting'].forEach((evt) =>
      video.addEventListener(evt, update)
    );
    update();
  }

  scan(document.documentElement);
  document.querySelectorAll('video').forEach(hookVideo);

  new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          scan(node);
          if (node.matches?.('video')) hookVideo(node);
          node.querySelectorAll?.('video').forEach(hookVideo);
        });
      } else {
        check(m.target);
      }
    }
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style'],
  });
})();
