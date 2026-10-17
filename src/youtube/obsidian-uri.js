(() => {
  'use strict';
  function buildUrl(filepath, vault) {
    const path = String(filepath || '').trim();
    if (!path || path.startsWith('/') || path.split('/').some(part => !part || part === '.' || part === '..') || !path.endsWith('.md')) throw new Error('笔记路径无效。');
    return `obsidian://new?file=${encodeURIComponent(path)}${vault ? `&vault=${encodeURIComponent(String(vault).trim())}` : ''}&clipboard`;
  }
  async function save(markdown, filepath, vault = '') {
    if (!String(markdown || '').trim()) throw new Error('笔记内容为空。');
    const url = buildUrl(filepath, vault);
    try { await navigator.clipboard.writeText(markdown); }
    catch { throw new Error('无法写入剪贴板；请复制 Markdown 后手动粘贴。'); }
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'openObsidianUrl', url }, result => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(result);
      });
    });
    if (!response?.success) throw new Error(`Markdown 已复制，但无法打开 Obsidian：${response?.error || '请确认 Obsidian 已安装'}`);
  }
  globalThis.OcaYouTubeUri = { buildUrl, save };
})();
