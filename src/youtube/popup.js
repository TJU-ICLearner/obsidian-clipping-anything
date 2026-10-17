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
  function transcriptSummary(snapshot) {
    if (snapshot.transcriptState === 'possibly-incomplete') return `已读取 ${snapshot.cues.length} 条页面文字记录；页面可能只渲染了一部分，结果可能不完整。`;
    if (snapshot.transcriptState === 'open-empty') return '文字记录已打开，但当前没有可读取的字幕；可以仅保存视频信息。';
    return '在 YouTube 打开文字记录后，点击这里的刷新。当前可以仅保存视频信息。';
  }
  function canSave(snapshot) { return /^[A-Za-z0-9_-]{11}$/.test(snapshot?.videoId || ''); }
  globalThis.OcaYouTubePopup = { validateSnapshotTab, transcriptSummary, canSave };

  if (!document.getElementById('youtube-popup')) return;
  const el = Object.fromEntries(['title','channel','source','transcript-status','transcript-preview','vault','folder','filepath','markdown-preview','refresh','copy','save','message','settings'].map(id => [id, document.getElementById(id)]));
  let captured = null;
  let note = null;
  let capturedTabId = null;
  const message = text => { el.message.textContent = text; };
  function render() {
    if (!captured) return;
    el.title.textContent = captured.title || '未命名视频';
    el.channel.textContent = captured.channel || '频道未知';
    el.source.textContent = captured.url;
    el['transcript-status'].textContent = transcriptSummary(captured);
    el['transcript-preview'].textContent = captured.cues.slice(0, 30).map(cue => `${globalThis.OcaYouTubeNote.stamp(cue.start)}  ${cue.text}`).join('\n');
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
    message('正在读取当前页面…');
    try {
      const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      const id = videoIdFromUrl(tab?.url);
      if (!id) throw new Error('请打开标准 YouTube 视频页面后重试。');
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'oca-youtube-snapshot', expectedVideoId: id });
      if (!response?.ok) throw new Error(response?.error || '页面读取失败，请刷新 YouTube 页面。');
      if (!await validateSnapshotTab(chrome.tabs, { tabId: tab.id, videoId: id })) throw new Error('视频页面已切换，请重新刷新预览。');
      captured = response.payload; capturedTabId = tab.id;
      render(); message('预览已更新。');
    } catch (error) { message(String(error.message || error)); }
  }
  async function checkedNote() {
    if (!note || !captured || !canSave(captured)) throw new Error('请先刷新视频预览。');
    if (!await validateSnapshotTab(chrome.tabs, { tabId: capturedTabId, videoId: captured.videoId })) throw new Error('当前标签或视频已改变，请刷新预览。');
    return note;
  }
  el.refresh.addEventListener('click', refresh);
  el.folder.addEventListener('change', async () => { await chrome.storage.sync.set({ anythingYoutubeFolder: el.folder.value.trim() }); render(); });
  el.vault.addEventListener('change', () => chrome.storage.local.set({ anythingYoutubeVault: el.vault.value }));
  el.copy.addEventListener('click', async () => { try { const current = await checkedNote(); await navigator.clipboard.writeText(current.markdown); message('完整 Markdown 已复制。'); } catch (error) { message(String(error.message || error)); } });
  el.save.addEventListener('click', async () => { try { const current = await checkedNote(); await globalThis.OcaYouTubeUri.save(current.markdown, current.filepath, el.vault.value); message('笔记内容已复制，正在交给 Obsidian；请在目标仓库确认新笔记。'); } catch (error) { message(String(error.message || error)); } });
  el.settings.addEventListener('click', () => chrome.runtime.openOptionsPage());
  Promise.resolve().then(loadSettings).then(refresh).catch(error => message(String(error.message || error)));
})();
