chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = tabs?.[0]?.url || "";
  let isBilibili = false;
  try {
    const parsed = new URL(url);
    isBilibili = parsed.hostname === "www.bilibili.com" &&
      (parsed.pathname.startsWith("/video/") || parsed.pathname.startsWith("/list/watchlater"));
  } catch {
    // Browser internal pages are handled by the general clipper.
  }
  location.replace(chrome.runtime.getURL(isBilibili ? "bilibili/popup.html" : "popup.html"));
});
