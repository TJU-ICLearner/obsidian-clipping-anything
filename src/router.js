chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = tabs?.[0]?.url || "";
  let isBilibili = false;
  let isYouTube = false;
  try {
    const parsed = new URL(url);
    isYouTube = parsed.protocol === "https:" && parsed.hostname === "www.youtube.com" && parsed.pathname === "/watch" && parsed.searchParams.getAll("v").length === 1 && /^[A-Za-z0-9_-]{11}$/.test(parsed.searchParams.get("v") || "");
    isBilibili = parsed.hostname === "www.bilibili.com" &&
      (parsed.pathname.startsWith("/video/") || parsed.pathname.startsWith("/list/watchlater"));
  } catch {
    // Browser internal pages are handled by the general clipper.
  }
  location.replace(chrome.runtime.getURL(isBilibili ? "bilibili/popup.html" : isYouTube ? "youtube/popup.html" : "popup.html"));
});
