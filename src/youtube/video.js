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

  function playerData(document, videoId) {
    let stalePlayer = false;
    for (const script of document.querySelectorAll('script')) {
      const source = script.textContent || '';
      const marker = /\bytInitialPlayerResponse\s*=\s*\{/.exec(source);
      if (!marker) continue;
      const start = marker.index + marker[0].length - 1;
      let depth = 0;
      let quoted = false;
      let escaped = false;
      for (let index = start; index < source.length; index++) {
        const character = source[index];
        if (quoted) {
          if (escaped) escaped = false;
          else if (character === '\\') escaped = true;
          else if (character === '"') quoted = false;
        } else if (character === '"') quoted = true;
        else if (character === '{') depth++;
        else if (character === '}' && --depth === 0) {
          try {
            const response = JSON.parse(source.slice(start, index + 1));
            const details = response.videoDetails;
            if (details?.videoId === videoId) {
              return {
                title: typeof details.title === 'string' ? details.title.trim() : '',
                channel: typeof details.author === 'string' ? details.author.trim() : '',
                description: typeof details.shortDescription === 'string' ? details.shortDescription.trim() : '',
                captionsAvailable: Boolean(response.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length),
              };
            }
            if (details?.videoId) stalePlayer = true;
          } catch { /* The page can contain a partial or non-JSON assignment. */ }
          break;
        }
      }
    }
    if (stalePlayer) throw new Error('YouTube 仍保留上一个视频的资料，请刷新视频网页后重试。');
    return null;
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
    const transcriptDiagnostics = {
      panel: panel ? 1 : 0,
      expanded: expanded ? 1 : 0,
      container: container ? 1 : 0,
      rows: container?.querySelectorAll(ROW).length || 0,
      timestamps: panel?.querySelectorAll('[class*="timestamp"], [class*="Timestamp"]').length || 0,
    };
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
    const player = isShort ? null : playerData(document, videoId);
    const metadata = isShort ? shortsMetadata(document, videoId) : {
      title: player?.title || (watch
        ? textAt(watch, 'ytd-watch-metadata h1, h1.ytd-watch-metadata')
        : document.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim()
          || textAt(document, 'ytd-watch-metadata h1, h1.ytd-watch-metadata')
          || String(document.title || '').replace(/\s*-\s*YouTube$/, '').trim()),
      channel: player?.channel || (watch
        ? textAt(watch, 'ytd-channel-name a, ytd-video-owner-renderer a')
        : textAt(document, 'ytd-channel-name a, ytd-video-owner-renderer a')
          || document.querySelector('link[itemprop="name"]')?.getAttribute('content')?.trim() || ''),
      description: player?.description || (watch
        ? textAt(watch, '#description-inline-expander, #description ytd-text-inline-expander')
        : textAt(document, '#description-inline-expander, #description ytd-text-inline-expander')),
    };
    return {
      videoId,
      title: metadata.title,
      channel: metadata.channel,
      url: isShort ? `https://www.youtube.com/shorts/${videoId}` : `https://www.youtube.com/watch?v=${videoId}`,
      description: metadata.description,
      captionsAvailable: Boolean(player?.captionsAvailable),
      chapters: [],
      cues,
      transcriptDiagnostics,
      transcriptState: !expanded ? 'unopened' : !container ? 'open-unrecognized' : cues.length ? 'possibly-incomplete' : 'open-empty',
    };
  }

  function canScroll(element) {
    if (!element || element.clientHeight <= 0 || element.scrollHeight <= element.clientHeight + 2) return false;
    const original = element.scrollTop;
    const target = original < element.scrollHeight - element.clientHeight - 1 ? original + 1 : Math.max(0, original - 1);
    element.scrollTop = target;
    const moved = Math.abs(element.scrollTop - original) > 0.5;
    element.scrollTop = original;
    return moved;
  }

  function transcriptScroller(container, panel) {
    for (let element = container; element && panel.contains(element); element = element.parentElement) {
      if (canScroll(element)) return element;
    }
    return null;
  }

  function waitForRows(container) {
    return new Promise(resolve => {
      let quiet;
      const finish = () => { observer.disconnect(); clearTimeout(quiet); clearTimeout(hard); resolve(); };
      const observer = new MutationObserver(() => { clearTimeout(quiet); quiet = setTimeout(finish, 60); });
      observer.observe(container, { childList: true, subtree: true, characterData: true });
      const hard = setTimeout(finish, 120);
    });
  }

  async function collect(document, value, expectedVideoId, options = {}) {
    const currentUrl = options.getUrl || (() => value);
    const first = snapshot(document, currentUrl(), expectedVideoId);
    const panel = document.querySelector(PANEL);
    const container = panel?.querySelector('#segments-container');
    if (!container || first.transcriptState === 'unopened') return first;
    const pageScroller = document.scrollingElement || document.documentElement;
    const scroller = transcriptScroller(container, panel) || (canScroll(pageScroller) ? pageScroller : null);
    if (!scroller) return first;
    const originalPosition = scroller.scrollTop;
    const cues = new Map();
    const addVisible = () => {
      const partial = snapshot(document, currentUrl(), expectedVideoId);
      for (const cue of partial.cues) cues.set(`${cue.start}\u0000${cue.text}`, cue);
    };
    const wait = options.waitForRender || (() => waitForRows(container));
    const now = options.now || Date.now;
    const started = now();
    const maxDurationMs = options.maxDurationMs || 25000;
    const move = async position => {
      const rendered = wait();
      scroller.scrollTop = position;
      await rendered;
    };
    let complete = false;
    let bottomChecks = 0;
    try {
      addVisible();
      await move(0);
      for (let step = 0; step < (options.maxSteps || 200) && now() - started < maxDurationMs; step++) {
        addVisible();
        const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
        if (atBottom) {
          if (++bottomChecks >= 2) { complete = true; break; }
          await wait();
          continue;
        }
        bottomChecks = 0;
        const before = scroller.scrollTop;
        await move(Math.min(before + Math.max(1, Math.floor(scroller.clientHeight * 0.8)), scroller.scrollHeight));
        if (scroller.scrollTop <= before) break;
      }
    } finally {
      scroller.scrollTop = originalPosition;
    }
    return { ...first, cues: Array.from(cues.values()).sort((a, b) => a.start - b.start), transcriptState: complete ? 'complete' : 'possibly-incomplete' };
  }

  globalThis.OcaYouTubeVideo = { videoIdFromUrl, secondsFromStamp, snapshot, collect };
})();
