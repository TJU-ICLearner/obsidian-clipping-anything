(() => {
  const frame = document.getElementById("bilibili-settings-frame");
  frame?.addEventListener("load", () => {
    const body = frame.contentDocument?.body;
    if (!body) return;
    const resize = () => { frame.style.height = `${Math.max(480, body.scrollHeight + 24)}px`; };
    resize();
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(resize).observe(body);
  });

  const select = document.getElementById("bili-settings-vault");
  const input = document.getElementById("bili-settings-new-vault");
  const add = document.getElementById("bili-settings-add-vault");
  const status = document.getElementById("bili-settings-vault-status");
  if (!select || !input || !add || !status || typeof chrome === "undefined" || !chrome.storage) return;

  async function refresh() {
    const [sync, local] = await Promise.all([
      chrome.storage.sync.get("vaults"),
      chrome.storage.local.get("anythingBilibiliVault")
    ]);
    const names = Array.isArray(sync.vaults) ? sync.vaults.filter((name) => typeof name === "string" && name.trim()) : [];
    select.replaceChildren(new Option("当前打开的仓库", ""));
    for (const name of names) select.add(new Option(name, name));
    const saved = String(local.anythingBilibiliVault || "");
    select.value = names.includes(saved) ? saved : "";
  }

  select.addEventListener("change", async () => {
    await chrome.storage.local.set({ anythingBilibiliVault: select.value });
    status.textContent = select.value ? `B 站主按钮将保存到「${select.value}」。` : "B 站主按钮将保存到当前打开的仓库。";
  });

  async function addVault() {
    const name = input.value.trim();
    if (!name) { status.textContent = "请输入仓库名称。"; input.focus(); return; }
    add.disabled = true;
    try {
      const sync = await chrome.storage.sync.get("vaults");
      const names = Array.isArray(sync.vaults) ? sync.vaults.filter((item) => typeof item === "string" && item.trim()) : [];
      if (!names.includes(name)) await chrome.storage.sync.set({ vaults: [...names, name] });
      await chrome.storage.local.set({ anythingBilibiliVault: name });
      input.value = "";
      await refresh();
      status.textContent = `已添加并选中「${name}」。`;
    } catch (error) {
      status.textContent = `保存仓库失败：${error?.message || error}`;
    } finally { add.disabled = false; }
  }

  add.addEventListener("click", addVault);
  input.addEventListener("keydown", (event) => { if (event.key === "Enter") addVault(); });
  chrome.storage.onChanged?.addListener((changes, area) => {
    if ((area === "sync" && changes.vaults) || (area === "local" && changes.anythingBilibiliVault)) {
      void refresh();
    }
  });
  void refresh();
})();

(() => {
  const vault = document.getElementById('youtube-settings-vault');
  const input = document.getElementById('youtube-settings-new-vault');
  const add = document.getElementById('youtube-settings-add-vault');
  const folder = document.getElementById('youtube-settings-folder');
  const status = document.getElementById('youtube-settings-status');
  if (!vault || !input || !add || !folder || !status || typeof chrome === 'undefined' || !chrome.storage) return;
  async function refresh() {
    const [sync, local] = await Promise.all([chrome.storage.sync.get(['vaults','anythingYoutubeFolder']), chrome.storage.local.get('anythingYoutubeVault')]);
    const names = Array.isArray(sync.vaults) ? sync.vaults.filter(name => typeof name === 'string' && name.trim()) : [];
    vault.replaceChildren(new Option('当前打开的仓库', ''));
    for (const name of names) vault.add(new Option(name, name));
    vault.value = names.includes(local.anythingYoutubeVault) ? local.anythingYoutubeVault : '';
    folder.value = sync.anythingYoutubeFolder || 'Clippings/YouTube';
  }
  vault.addEventListener('change', async () => { await chrome.storage.local.set({ anythingYoutubeVault: vault.value }); status.textContent = 'YouTube 默认仓库已保存。'; });
  folder.addEventListener('change', async () => { await chrome.storage.sync.set({ anythingYoutubeFolder: folder.value.trim() }); status.textContent = 'YouTube 目标文件夹已保存。'; });
  add.addEventListener('click', async () => {
    const name = input.value.trim();
    if (!name) { status.textContent = '请输入仓库名称。'; return; }
    try {
      const sync = await chrome.storage.sync.get('vaults');
      const names = Array.isArray(sync.vaults) ? sync.vaults.filter(item => typeof item === 'string' && item.trim()) : [];
      if (!names.includes(name)) await chrome.storage.sync.set({ vaults: [...names, name] });
      await chrome.storage.local.set({ anythingYoutubeVault: name });
      input.value = '';
      await refresh();
      status.textContent = `已添加并选中「${name}」。`;
    } catch (error) { status.textContent = `设置保存失败：${error?.message || error}`; }
  });
  chrome.storage.onChanged?.addListener((changes, area) => { if ((area === 'sync' && (changes.vaults || changes.anythingYoutubeFolder)) || (area === 'local' && changes.anythingYoutubeVault)) void refresh(); });
  void refresh();
})();
