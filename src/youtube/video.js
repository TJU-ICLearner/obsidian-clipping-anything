(() => {
  'use strict';
  const ID = /^[A-Za-z0-9_-]{11}$/;
  const PANEL = 'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]';
  const ROW = 'ytd-transcript-segment-renderer, transcript-segment-view-model';

  function videoIdFromUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.hostname !== 'www.youtube.com') return null;
      if (url.pathname === '/watch') {
        const ids = url.searchParams.getAll('v');
        return ids.length === 1 && ID.test(ids[0]) ? ids[0] : null;
      }
      const short = url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})\/?$/);
      return short ? short[1] : null;
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

  function shortsMetadata(document, videoId) {
    const active = document.querySelector('ytd-reel-video-renderer[is-active], ytd-reel-video-renderer[active], ytd-reel-video-renderer.active');
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href')
      || document.querySelector('meta[property="og:url"]')?.getAttribute('content') || '';
    const canonicalId = videoIdFromUrl(canonical);
    if (active) {
      const attributeId = active.getAttribute('video-id') || active.getAttribute('data-video-id');
      const linkId = Array.from(active.querySelectorAll('a[href]'))
        .map(link => videoIdFromUrl(new URL(link.getAttribute('href'), 'https://www.youtube.com').href))
        .find(Boolean);
      const boundId = attributeId || linkId || canonicalId;
      if (boundId !== videoId) throw new Error('Shorts 视频页面正在切换，请稍后刷新。');
      return {
        title: textAt(active, 'yt-shorts-video-title-view-model h2, h2'),
        channel: textAt(active, '#channel-name, ytd-channel-name a'),
        description: textAt(active, '[id="description-inline-expander"], [id="description"]'),
      };
    }
    if (canonicalId === videoId) {
      return {
        title: document.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() || '',
        channel: '',
        description: document.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() || '',
      };
    }
    return { title: '', channel: '', description: '' };
  }

  function snapshot(document, value, expectedVideoId) {
    const videoId = videoIdFromUrl(value);
    if (!videoId) throw new Error('当前页面不是受支持的 YouTube 视频。');
    if (expectedVideoId && videoId !== expectedVideoId) throw new Error('当前视频已变化，请刷新预览。');
    const isShort = new URL(value).pathname.startsWith('/shorts/');
    const watch = !isShort && document.querySelector('ytd-watch-flexy[video-id]');
    if (watch && watch.getAttribute('video-id') !== videoId) throw new Error('视频页面正在切换，请稍后刷新。');

    const staleWatch = isShort && document.querySelector('ytd-watch-flexy[video-id]');
    const panel = staleWatch ? null : document.querySelector(PANEL);
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
    const metadata = isShort ? shortsMetadata(document, videoId) : {
      title: document.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim()
        || textAt(document, 'ytd-watch-metadata h1, h1.ytd-watch-metadata')
        || String(document.title || '').replace(/\s*-\s*YouTube$/, '').trim(),
      channel: textAt(document, 'ytd-channel-name a, ytd-video-owner-renderer a')
        || document.querySelector('link[itemprop="name"]')?.getAttribute('content')?.trim() || '',
      description: textAt(document, '#description-inline-expander, #description ytd-text-inline-expander'),
    };
    return {
      videoId,
      title: metadata.title,
      channel: metadata.channel,
      url: isShort ? `https://www.youtube.com/shorts/${videoId}` : `https://www.youtube.com/watch?v=${videoId}`,
      description: metadata.description,
      chapters: [],
      cues,
      transcriptState: !expanded || !container ? 'unopened' : cues.length ? 'possibly-incomplete' : 'open-empty',
    };
  }

  globalThis.OcaYouTubeVideo = { videoIdFromUrl, secondsFromStamp, snapshot };
})();
