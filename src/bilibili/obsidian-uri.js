// Shared by the Bilibili popup and its in-page controls.
globalThis.BiliObsidianUri = (() => {
  function buildUrl(filepath, vault = "") {
    const path = String(filepath || "").trim().replace(/^\/+/, "");
    if (!path || !path.toLowerCase().endsWith(".md")) {
      throw new Error("笔记路径无效，请重新抓取视频。");
    }
    const vaultQuery = vault ? `&vault=${encodeURIComponent(String(vault).trim())}` : "";
    const fallback = "无法读取剪贴板，请从剪藏器复制 Markdown 后粘贴到此笔记。";
    return `obsidian://new?file=${encodeURIComponent(path)}${vaultQuery}&clipboard&content=${encodeURIComponent(fallback)}`;
  }

  async function save(content, filepath, vault = "") {
    if (!String(content || "").trim()) {
      throw new Error("没有可保存的笔记内容。");
    }
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      throw new Error("无法写入剪贴板。请在扩展弹窗中点击“复制 Markdown”，再手动粘贴到 Obsidian。");
    }
    const url = buildUrl(filepath, vault);
    let response;
    try {
      response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "openObsidianUrl", url }, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      });
    } catch (error) {
      throw new Error(`Markdown 已复制，但无法打开 Obsidian：${error?.message || error}`);
    }
    if (!response?.success) {
      throw new Error(`Markdown 已复制，但无法打开 Obsidian：${response?.error || "请确认桌面应用已安装"}`);
    }
  }

  return { buildUrl, save };
})();
