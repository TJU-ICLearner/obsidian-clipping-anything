(() => {
  'use strict';
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'oca-youtube-snapshot') return false;
    try {
      const payload = globalThis.OcaYouTubeVideo.snapshot(document, location.href, message.expectedVideoId);
      sendResponse({ ok: true, payload });
    } catch (error) {
      sendResponse({ ok: false, error: String(error?.message || error) });
    }
    return false;
  });
})();
