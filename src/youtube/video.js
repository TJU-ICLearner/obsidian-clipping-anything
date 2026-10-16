(() => {
  'use strict';
  const ID = /^[A-Za-z0-9_-]{11}$/;
  const PANEL = 'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]';
  const ROW = 'ytd-transcript-segment-renderer, transcript-segment-view-model';

  function videoIdFromUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.hostname !== 'www.youtube.com' || url.pathname !== '/watch') return null;
      const ids = url.searchParams.getAll('v');
      return ids.length === 1 && ID.test(ids[0]) ? ids[0] : null;
    } catch { return null; }
  }

  function secondsFromStamp(value) {
    const parts = String(value || '').trim().split(':');
    if (parts.length < 2 || parts.length > 3 || parts.some(part => !/^\d+$/.test(part))) return null;
    const numbers = parts.map(Number);
    if (numbers.slice(1).some(number => number >= 60)) return null;
    return numbers.reduce((total, number) => total * 60 + number, 0);
  }

  function textAt(root, selector) {
    return root.querySelector(selector)?.textContent?.trim() || '';
  }

  function snapshot(document, value, expectedVideoId) {
    const videoId = videoIdFromUrl(value);
    if (!videoId) throw new Error('当前页面不是受支持的 YouTube 视频。');
    if (expectedVideoId && videoId !== expectedVideoId) throw new Error('当前视频已变化，请刷新预览。');
    const watch = document.querySelector('ytd-watch-flexy[video-id]');
    if (watch && watch.getAttribute('video-id') !== videoId) throw new Error('视频页面正在切换，请稍后刷新。');

    const panel = document.querySelector(PANEL);
    const container = panel?.querySelector('#segments-container');
    const expanded = panel && panel.getAttribute('visibility') !== 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN' && panel.getAttribute('hidden') === null;
    const cues = [];
    const seen = new Set();
    if (expanded && container) {
      for (const row of container.querySelectorAll(ROW)) {
        const stamp = textAt(row, '.segment-timestamp, .ytwTranscriptSegmentViewModelTimestamp');
        const text = textAt(row, '.segment-text, span.yt-core-attributed-string');
        const start = secondsFromStamp(stamp);
        if (start === null || !text) continue;
        const key = `${videoId}\u0000${start}\u0000${text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        cues.push({ start, text });
      }
    }
    const title = document.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim()
      || textAt(document, 'ytd-watch-metadata h1, h1.ytd-watch-metadata')
      || String(document.title || '').replace(/\s*-\s*YouTube$/, '').trim();
    const channel = textAt(document, 'ytd-channel-name a, ytd-video-owner-renderer a')
      || document.querySelector('link[itemprop="name"]')?.getAttribute('content')?.trim() || '';
    const description = textAt(document, '#description-inline-expander, #description ytd-text-inline-expander');
    return {
      videoId,
      title,
      channel,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      description,
      chapters: [],
      cues,
      transcriptState: !expanded || !container ? 'unopened' : cues.length ? 'possibly-incomplete' : 'open-empty',
    };
  }

  globalThis.OcaYouTubeVideo = { videoIdFromUrl, secondsFromStamp, snapshot };
})();
