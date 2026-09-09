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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // A tab opened after a video is already playing elsewhere never sees a
  // broadcast - broadcast() only fires on a true/false transition, not for
  // every new listener that shows up mid-state. Content scripts ask for
  // the current state on load instead of waiting for one.
  if (msg?.type === 'yt-get-state') {
    sendResponse({ playing: playingTabs.size > 0 });
    return;
  }
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
