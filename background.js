// Tracks which tabs currently have a playing YouTube <video>, and
// broadcasts the aggregate state to every tab so content scripts can
// throttle paint-heavy animations while any video is playing.
const playingTabs = new Set();

function broadcast(playing) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id == null) continue;
      chrome.tabs.sendMessage(tab.id, { type: 'yt-playing-changed', playing }, () => {
        void chrome.runtime.lastError;
      });
    }
  });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== 'yt-video-state' || sender.tab?.id == null) return;
  const before = playingTabs.size > 0;
  if (msg.playing) playingTabs.add(sender.tab.id);
  else playingTabs.delete(sender.tab.id);
  const after = playingTabs.size > 0;
  if (before !== after) broadcast(after);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (playingTabs.delete(tabId) && playingTabs.size === 0) broadcast(false);
});
