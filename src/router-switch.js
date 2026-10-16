const biliModeLink = document.getElementById("anything-bilibili-link");
if (biliModeLink && new URLSearchParams(location.search).get("from") === "bilibili") {
  biliModeLink.style.display = "inline";
}
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!biliModeLink) return;
  try {
    const parsed = new URL(tabs?.[0]?.url || "");
    if (parsed.hostname === "www.bilibili.com" &&
        (parsed.pathname.startsWith("/video/") || parsed.pathname.startsWith("/list/watchlater"))) {
      biliModeLink.style.display = "inline";
    }
  } catch {
    // Keep the Bilibili mode hidden on unsupported pages.
  }
});
