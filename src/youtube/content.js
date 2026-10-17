(() => {
  'use strict';
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'oca-youtube-snapshot') return false;
    Promise.resolve()
      .then(() => globalThis.OcaYouTubeVideo.collect(document, location.href, message.expectedVideoId, { getUrl: () => location.href }))
      .then(payload => sendResponse({ ok: true, payload }))
      .catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  });
})();
