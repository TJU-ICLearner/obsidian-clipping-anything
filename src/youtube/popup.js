(() => {
  'use strict';
  const videoIdFromUrl = value => {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.hostname !== 'www.youtube.com') return null;
      if (url.pathname === '/watch') {
        const ids = url.searchParams.getAll('v');
        return ids.length === 1 && /^[A-Za-z0-9_-]{11}$/.test(ids[0]) ? ids[0] : null;
      }
      return url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})\/?$/)?.[1] || null;
    } catch { return null; }
  };
  async function validateSnapshotTab(tabs, { tabId, videoId }) {
    try {
      const active = (await tabs.query({ active: true, currentWindow: true }))[0];
      return active?.id === tabId && videoIdFromUrl(active.url) === videoId;
    } catch { return false; }
  }
  function shortsWatchUrl(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.cues) || snapshot.cues.length || !/^[A-Za-z0-9_-]{11}$/.test(snapshot.videoId || '')) return null;
    try {
      const url = new URL(snapshot.url);
      if (url.protocol !== 'https:' || url.hostname !== 'www.youtube.com' || !/^\/shorts\/[A-Za-z0-9_-]{11}\/?$/.test(url.pathname)) return null;
      if (videoIdFromUrl(snapshot.url) !== snapshot.videoId) return null;
      return `https://www.youtube.com/watch?v=${snapshot.videoId}`;
    } catch { return null; }
  }
  function transcriptSummary(snapshot) {
    if (snapshot.cues.length && snapshot.transcriptState === 'complete') return `已遍历文字记录，读取 ${snapshot.cues.length} 条字幕。`;
    if (snapshot.cues.length && snapshot.transcriptState === 'web-fallback') return `从网页裁剪提取器读取 ${snapshot.cues.length} 条带时间字幕。`;
    if (snapshot.cues.length && snapshot.transcriptState === 'possibly-incomplete') return `已读取 ${snapshot.cues.length} 条页面文字记录；页面可能只渲染了一部分，结果可能不完整。`;
    const hasExcerpt = globalThis.OcaYouTubeNote?.untimedSentences(snapshot.description, snapshot.title).length;
    if (snapshot.transcriptState === 'open-unrecognized' || snapshot.transcriptState === 'open-empty') {
      const d = snapshot.transcriptDiagnostics || {};
      return `文字记录已展开，但未识别到带时间的字幕。诊断：面板 ${d.panel ?? 0}、容器 ${d.container ?? 0}、行 ${d.rows ?? 0}、时间 ${d.timestamps ?? 0}。现在保存${hasExcerpt ? '的只是简介摘录，非完整字幕' : '不会包含字幕'}。`;
    }
    if (snapshot.captionsAvailable && snapshot.transcriptState === 'unopened') return `这个视频有字幕。请在 YouTube 展开“显示文字记录”，再点刷新。现在保存${hasExcerpt ? '的只是简介摘录，非完整字幕' : '不会包含字幕'}。`;
    if (hasExcerpt) return '未取得带时间的文字记录；只会保存简介摘录，非完整字幕，无时间轴且未经音频校对。不能按字幕跳转或高亮。';
    if (shortsWatchUrl(snapshot)) return '当前 Shorts 页面没有可读取的文字记录；本次只会保存视频信息。可到普通播放页查看是否有“显示文字记录”。';
    if (snapshot.transcriptState === 'open-empty') return '文字记录已打开，但当前没有可读取的字幕；可以仅保存视频信息。';
    return '在 YouTube 打开文字记录后，点击这里的刷新。当前可以仅保存视频信息。';
  }
  function readError(error) {
    const detail = String(error?.message || error);
    if (/message channel closed|message port closed|extension context invalidated|receiving end does not exist/i.test(detail)) return '读取连接中断。请刷新 YouTube 网页，重新打开文字记录，再点扩展中的“刷新”。';
    return detail;
  }
  async function requestSnapshot(tabId, videoId) {
    const request = { type: 'oca-youtube-snapshot', expectedVideoId: videoId };
    try {
      return await chrome.tabs.sendMessage(tabId, request);
    } catch (error) {
      if (!/receiving end does not exist/i.test(String(error?.message || error))) throw error;
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['youtube/video.js', 'youtube/content.js'] });
        return await chrome.tabs.sendMessage(tabId, request);
      } catch (retryError) {
        throw new Error(`自动连接失败：${String(retryError?.message || retryError)}。请刷新 YouTube 网页；若仍失败，请检查扩展的网站访问权限。`);
      }
    }
  }
  function canSave(snapshot) { return /^[A-Za-z0-9_-]{11}$/.test(snapshot?.videoId || ''); }
  function parseWebTranscript(html, videoId) {
    if (!canSave({ videoId }) || typeof html !== 'string') return [];
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const currentVideo = Array.from(parsed.querySelectorAll('iframe[src]')).some(frame => {
      try {
        const src = new URL(frame.getAttribute('src'));
        return src.protocol === 'https:' && src.hostname === 'www.youtube.com' && src.pathname === `/embed/${videoId}`;
      } catch { return false; }
    });
    if (!currentVideo) return [];
    const cues = new Map();
    for (const row of parsed.querySelectorAll('.youtube.transcript .transcript-segment')) {
      const stamp = row.querySelector('.timestamp[data-timestamp]');
      const start = Number(stamp?.getAttribute('data-timestamp'));
      if (!stamp || !Number.isFinite(start) || start < 0) continue;
      const copy = row.cloneNode(true);
      copy.querySelector('.timestamp')?.closest('strong')?.remove();
      const text = (copy.textContent || '').replace(/^[\s·•—:|-]+/, '').replace(/\s+/g, ' ').trim();
      if (text) cues.set(`${start}\u0000${text}`, { start, text });
    }
    return Array.from(cues.values()).sort((a, b) => a.start - b.start);
  }
  async function webTranscript(tabId, videoId) {
    const request = { action: 'sendMessageToTab', tabId, message: { action: 'getPageContent' } };
    const extract = async () => {
      const response = await chrome.runtime.sendMessage(request);
      if (!response?.content) throw new Error(response?.error || '网页裁剪未返回内容');
      const cues = parseWebTranscript(response.content, videoId);
      return { cues, diagnostic: cues.length ? '' : '已返回网页内容，但没有识别到当前视频的带时间字幕' };
    };
    try {
      return await extract();
    } catch {
      try {
        const injected = await chrome.runtime.sendMessage({ action: 'forceInjectContentScript', tabId });
        if (injected?.success === false) throw new Error(injected.error || '内容脚本重新连接失败');
        return await extract();
      } catch (error) { return { cues: [], diagnostic: `连接失败：${String(error?.message || error).slice(0, 140)}` }; }
    }
  }
  globalThis.OcaYouTubePopup = { validateSnapshotTab, transcriptSummary, readError, canSave, parseWebTranscript };

  if (!document.getElementById('youtube-popup')) return;
  const el = Object.fromEntries(['title','channel','source','transcript-status','open-watch','transcript-preview','vault','folder','filepath','markdown-preview','refresh','copy','save','message','settings'].map(id => [id, document.getElementById(id)]));
  let captured = null;
  let note = null;
  let capturedTabId = null;
  const message = text => { el.message.textContent = text; };
  function render() {
    if (!captured) return;
    el.title.textContent = captured.title || '未命名视频';
    el.channel.textContent = captured.channel || '频道未知';
    el.source.textContent = captured.url;
    el['transcript-status'].textContent = transcriptSummary(captured) + (captured.webTranscriptDiagnostic ? ` 网页裁剪回退：${captured.webTranscriptDiagnostic}。` : '');
    el['open-watch'].hidden = !shortsWatchUrl(captured);
    el['transcript-preview'].textContent = captured.cues.length
      ? captured.cues.slice(0, 30).map(cue => `${globalThis.OcaYouTubeNote.stamp(cue.start)}  ${cue.text}`).join('\n')
      : globalThis.OcaYouTubeNote.untimedSentences(captured.description, captured.title).slice(0, 30).join('\n');
    try {
      note = globalThis.OcaYouTubeNote.build(captured, { folder: el.folder.value.trim() });
      el.filepath.textContent = note.filepath;
      el['markdown-preview'].value = note.markdown;
      el.save.disabled = false;
      el.copy.disabled = false;
    } catch (error) {
      note = null; el.filepath.textContent = '路径无效'; el['markdown-preview'].value = '';
      el.save.disabled = true; el.copy.disabled = true; message(String(error.message || error));
    }
  }
  async function loadSettings() {
    const [sync, local] = await Promise.all([chrome.storage.sync.get(['vaults','anythingYoutubeFolder']), chrome.storage.local.get('anythingYoutubeVault')]);
    const names = Array.isArray(sync.vaults) ? sync.vaults.filter(name => typeof name === 'string' && name.trim()) : [];
    for (const name of names) { const option = document.createElement('option'); option.value = name; option.textContent = name; el.vault.appendChild(option); }
    el.vault.value = names.includes(local.anythingYoutubeVault) ? local.anythingYoutubeVault : '';
    el.folder.value = sync.anythingYoutubeFolder || 'Clippings/YouTube';
  }
  async function refresh() {
    captured = null; note = null; el.save.disabled = true; el.copy.disabled = true;
    el.title.textContent = '正在读取视频…';
    el['transcript-status'].textContent = '正在读取…';
    message('正在读取当前页面…');
    try {
      const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      const id = videoIdFromUrl(tab?.url);
      if (!id) throw new Error('请打开标准 YouTube 视频页面后重试。');
      const response = await requestSnapshot(tab.id, id);
      if (!response?.ok) throw new Error(response?.error || '页面读取失败，请刷新 YouTube 页面。');
      if (!await validateSnapshotTab(chrome.tabs, { tabId: tab.id, videoId: id })) throw new Error('视频页面已切换，请重新刷新预览。');
      let snapshot = response.payload;
      if (!snapshot.cues?.length) {
        const web = await webTranscript(tab.id, id);
        snapshot = web.cues.length
          ? { ...snapshot, cues: web.cues, transcriptState: 'web-fallback' }
          : { ...snapshot, webTranscriptDiagnostic: web.diagnostic };
      }
      if (!await validateSnapshotTab(chrome.tabs, { tabId: tab.id, videoId: id })) throw new Error('视频页面已切换，请重新刷新预览。');
      captured = snapshot; capturedTabId = tab.id;
      render(); message('预览已更新。');
    } catch (error) {
      el.title.textContent = '读取失败';
      el['transcript-status'].textContent = '读取失败，请查看下方提示。';
      message(readError(error));
    }
  }
  async function checkedNote() {
    if (!note || !captured || !canSave(captured)) throw new Error('请先刷新视频预览。');
    if (!await validateSnapshotTab(chrome.tabs, { tabId: capturedTabId, videoId: captured.videoId })) throw new Error('当前标签或视频已改变，请刷新预览。');
    return note;
  }
  el.refresh.addEventListener('click', refresh);
  el['open-watch'].addEventListener('click', async () => {
    try {
      const watchUrl = shortsWatchUrl(captured);
      if (!watchUrl || !await validateSnapshotTab(chrome.tabs, { tabId: capturedTabId, videoId: captured.videoId })) throw new Error('当前视频已变化，请刷新预览。');
      await chrome.tabs.update(capturedTabId, { url: watchUrl });
    } catch (error) { message(String(error.message || error)); }
  });
  el.folder.addEventListener('change', async () => { await chrome.storage.sync.set({ anythingYoutubeFolder: el.folder.value.trim() }); render(); });
  el.vault.addEventListener('change', () => chrome.storage.local.set({ anythingYoutubeVault: el.vault.value }));
  el.copy.addEventListener('click', async () => { try { const current = await checkedNote(); await navigator.clipboard.writeText(current.markdown); message('完整 Markdown 已复制。'); } catch (error) { message(String(error.message || error)); } });
  el.save.addEventListener('click', async () => { try { const current = await checkedNote(); await globalThis.OcaYouTubeUri.save(current.markdown, current.filepath, el.vault.value); message('笔记内容已复制，正在交给 Obsidian；请在目标仓库确认新笔记。'); } catch (error) { message(String(error.message || error)); } });
  el.settings.addEventListener('click', () => chrome.runtime.openOptionsPage());
  Promise.resolve().then(loadSettings).then(refresh).catch(error => message(String(error.message || error)));
})();
