// Reports YouTube <video> play state to the background service worker,
// which relays it to every other tab.
(function () {
  function hook(video) {
    if (video.dataset.ytFixHooked) return;
    video.dataset.ytFixHooked = '1';
    const report = () =>
      chrome.runtime.sendMessage({ type: 'yt-video-state', playing: !video.paused && !video.ended });
    ['play', 'playing', 'pause', 'ended', 'waiting'].forEach((evt) => video.addEventListener(evt, report));
    report();
  }

  document.querySelectorAll('video').forEach(hook);

  new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.matches?.('video')) hook(node);
        node.querySelectorAll?.('video').forEach(hook);
      });
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
