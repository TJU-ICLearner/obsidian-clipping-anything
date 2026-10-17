const { Plugin, Notice, TFile } = require("obsidian");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

class EmbeddedVideo {
  constructor() {
    this.remote = require("@electron/remote");
  }

  frame(name, source) {
    const expected = new URL(source);
    const frames = this.remote.getCurrentWebContents().mainFrame.framesInSubtree;
    const named = frames.filter((frame) => frame.name === name);
    if (named.length === 1) {
      try {
        const actual = new URL(named[0].url);
        if (actual.hostname === "player.bilibili.com" && actual.pathname === "/player.html") {
          if ((actual.searchParams.has("bvid") && expected.searchParams.has("bvid") &&
              actual.searchParams.get("bvid") !== expected.searchParams.get("bvid")) ||
              (actual.searchParams.has("aid") && expected.searchParams.has("aid") &&
              actual.searchParams.get("aid") !== expected.searchParams.get("aid"))) return undefined;
        }
      } catch { /* The named iframe may be navigating. */ }
      return named[0];
    }
    if (named.length > 1) return undefined;
    const instance = expected.searchParams.get("oca_instance");
    if (instance) {
      const marked = frames.filter((frame) => {
        try {
          const actual = new URL(frame.url);
          return actual.hostname === "player.bilibili.com" && actual.pathname === "/player.html" &&
            actual.searchParams.get("oca_instance") === instance;
        } catch { return false; }
      });
      return marked.length === 1 ? marked[0] : undefined;
    }
    const matching = frames.filter((frame) => {
      try {
        const actual = new URL(frame.url);
        return actual.hostname === "player.bilibili.com" && actual.pathname === "/player.html" &&
          ((expected.searchParams.has("bvid") && actual.searchParams.get("bvid") === expected.searchParams.get("bvid")) ||
            (expected.searchParams.has("aid") && actual.searchParams.get("aid") === expected.searchParams.get("aid"))) &&
          Number(actual.searchParams.get("page") || actual.searchParams.get("p") || 1) ===
          Number(expected.searchParams.get("page") || expected.searchParams.get("p") || 1);
      } catch { return false; }
    });
    return matching.length === 1 ? matching[0] : undefined;
  }

  diagnostic(name, source) {
    const expected = new URL(source);
    const frames = this.remote.getCurrentWebContents().mainFrame.framesInSubtree;
    const candidates = [];
    for (const frame of frames) {
      let url;
      try { url = new URL(frame.url); } catch { continue; }
      const isBilibili = url.hostname === "bilibili.com" || url.hostname.endsWith(".bilibili.com");
      if (!isBilibili && frame.name !== name && !frame.name?.startsWith("oca-player-")) continue;
      candidates.push({
        name: frame.name || "",
        host: url.hostname,
        path: isBilibili ? url.pathname : undefined,
        bvid: isBilibili ? url.searchParams.get("bvid") : undefined,
        aid: isBilibili ? url.searchParams.get("aid") : undefined,
        page: isBilibili ? url.searchParams.get("page") || url.searchParams.get("p") : undefined,
        instance: isBilibili ? url.searchParams.get("oca_instance") : undefined,
        detached: Boolean(frame.detached),
      });
      if (candidates.length === 20) break;
    }
    return {
      requested: { name, bvid: expected.searchParams.get("bvid"), aid: expected.searchParams.get("aid"),
        page: expected.searchParams.get("page") || expected.searchParams.get("p"),
        instance: expected.searchParams.get("oca_instance") },
      totalFrames: frames.length,
      candidates,
    };
  }

  async run(name, source, seconds) {
    const frame = this.frame(name, source);
    if (!frame) {
      const error = new Error("笔记视频还未准备好，请稍后重试。");
      try { error.diagnostic = this.diagnostic(name, source); }
      catch { /* Preserve the playback error if frame details are unavailable. */ }
      throw error;
    }
    const seek = seconds === undefined ? "" : `video.currentTime = ${Number(seconds)};`;
    const result = await frame.executeJavaScript(`(() => {
      const video = document.querySelector('video');
      if (!video) return null;
      ${seek}
      return { seconds: video.currentTime, paused: video.paused, duration: video.duration };
    })()`);
    if (!result || !Number.isFinite(result.seconds)) throw new Error("暂时无法读取笔记内的视频。");
    return result;
  }
}

function secondsFromStamp(stamp) {
  const parts = stamp.split(":").map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part))) return null;
  return parts.reduce((seconds, part) => seconds * 60 + part, 0);
}

function videoClock(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value / 60) % 60;
  const remainder = value % 60;
  return hours ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function parseTranscript(markdown) {
  const lines = markdown.split(/\r?\n/);
  let inSubtitle = false;
  const cues = [];
  for (const line of lines) {
    if (/^##\s+字幕\s*$/.test(line)) { inSubtitle = true; continue; }
    if (inSubtitle && /^##\s+/.test(line)) break;
    if (!inSubtitle || /^###\s+/.test(line)) continue;
    const match = line.match(/^\s*(?:[-*]\s*)?(?:\[(\d{2}:\d{2}(?::\d{2})?)\]\([^)]*\)|`(\d{2}:\d{2}(?::\d{2})?)`)\s+(.+?)\s*$/);
    if (!match) continue;
    const stamp = match[1] || match[2];
    const seconds = secondsFromStamp(stamp);
    if (seconds === null) continue;
    cues.push({ stamp, seconds, text: match[3] });
  }
  return cues;
}

function bilibiliEmbedUrl(raw, seconds) {
  try {
    const url = new URL(raw);
    if (url.hostname !== "player.bilibili.com" || url.pathname !== "/player.html") return null;
    url.searchParams.set("t", String(Math.max(0, Math.floor(seconds))));
    return url.toString();
  } catch { return null; }
}

function youtubeEmbedId(raw) {
  try {
    const url = new URL(raw);
    const match = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})$/);
    return url.protocol === "https:" && url.hostname === "www.youtube.com" ? match?.[1] || null : null;
  } catch { return null; }
}

function youtubeIdFromNote(markdown) {
  const frontmatter = String(markdown).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  if (!frontmatter || !/^clip_platform:\s*youtube\s*$/m.test(frontmatter)) return null;
  const id = frontmatter.match(/^youtube_id:\s*["']?([A-Za-z0-9_-]{11})["']?\s*$/m)?.[1];
  return id || null;
}

function youtubeLinkMatches(raw, id, seconds) {
  try {
    const url = new URL(raw);
    const linkedId = url.hostname === "www.youtube.com" && url.pathname === "/watch"
      ? url.searchParams.get("v") : youtubeEmbedId(raw);
    const time = Number(url.searchParams.get("t") || url.searchParams.get("start"));
    return url.protocol === "https:" && linkedId === id && Number.isFinite(time) && time === seconds;
  } catch { return false; }
}

function prepareTimestampControls(preview, dock, source) {
  const sourceUrl = new URL(source);
  const bvid = sourceUrl.searchParams.get("bvid");
  const page = Number(sourceUrl.searchParams.get("page") || sourceUrl.searchParams.get("p") || 1);
  for (const anchor of preview.querySelectorAll("a[href]")) {
    if (dock.contains(anchor) || !/^\d{2}:\d{2}(?::\d{2})?$/.test(anchor.textContent.trim())) continue;
    let url;
    try { url = new URL(anchor.href); } catch { continue; }
    if (url.hostname !== "player.bilibili.com" || url.pathname !== "/player.html" ||
        url.searchParams.get("bvid") !== bvid ||
        Number(url.searchParams.get("page") || url.searchParams.get("p") || 1) !== page ||
        Number(url.searchParams.get("t")) !== secondsFromStamp(anchor.textContent.trim())) continue;
    const code = document.createElement("code");
    code.id = anchor.id;
    code.textContent = anchor.textContent.trim();
    anchor.replaceWith(code);
  }
  for (const code of preview.querySelectorAll("code")) {
    if (dock.contains(code) || code.closest("pre") || !/^\d{2}:\d{2}(?::\d{2})?$/.test(code.textContent.trim())) continue;
    code.classList.add("oca-note-timestamp");
    code.setAttribute("role", "button");
    code.setAttribute("tabindex", "0");
    code.setAttribute("aria-label", `跳转笔记视频至 ${code.textContent.trim()}`);
  }
}

function waitForAttachment(node) {
  if (node.isConnected) return Promise.resolve(true);
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (node.isConnected) finish(true);
    });
    let timeout;
    const finish = (connected) => {
      observer.disconnect();
      clearTimeout(timeout);
      resolve(connected);
    };
    observer.observe(document, { childList: true, subtree: true });
    timeout = setTimeout(() => finish(false), 10000);
    if (node.isConnected) finish(true);
  });
}

module.exports = class ObsidianClipperAnythingPlayer extends Plugin {
  writeFrameDiagnostic(diagnostic) {
    try {
      const basePath = this.app.vault.adapter.getBasePath();
      const configDir = this.app.vault.configDir || ".obsidian";
      const file = path.join(basePath, configDir, "plugins", this.manifest.id, "frame-diagnostic.json");
      fs.writeFileSync(file, JSON.stringify({ recordedAt: new Date().toISOString(), ...diagnostic }, null, 2));
    } catch { /* Keep the original playback error if diagnostics cannot be saved. */ }
  }

  async onload() {
    this.playerSessions = new Map();
    try { this.embeddedVideo = new EmbeddedVideo(); }
    catch (error) { this.embeddedVideoError = error; }
    this.register(() => {
      for (const preview of this.playerSessions.keys()) this.disposePlayer(preview);
    });
    this.registerEvent(this.app.workspace.on("file-open", () => this.prunePlayers()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.prunePlayers()));
    this.registerMarkdownPostProcessor((el, ctx) => {
      const youtubeFrame = [...el.querySelectorAll("iframe")].find((node) => youtubeEmbedId(node.src));
      if (youtubeFrame && !youtubeFrame.closest(".oca-player-dock")) {
        const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
        if (file instanceof TFile) void this.dispatchYouTubeFrame(youtubeFrame, file);
        return;
      }
      const iframe = [...el.querySelectorAll("iframe")].find((node) => bilibiliEmbedUrl(node.src, 0));
      if (!iframe) return;
      const source = iframe.getAttribute("src");
      const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
      if (!(file instanceof TFile)) return;
      const host = document.createElement("section");
      host.className = "oca-note-player";
      iframe.replaceWith(host);
      void this.mountPlayer(host, file, source);
    });
  }

  disposePlayer(preview) {
    const session = this.playerSessions?.get(preview);
    if (!session) return;
    clearInterval(session.progressTimer);
    session.controller?.destroy();
    session.observer?.disconnect();
    preview.removeEventListener("click", session.click, true);
    preview.removeEventListener("keydown", session.keydown, true);
    session.dock.remove();
    this.playerSessions.delete(preview);
  }

  prunePlayers() {
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    for (const [preview, session] of this.playerSessions) {
      const leaf = leaves.find((item) => item.containerEl?.contains(preview));
      if (!preview.isConnected || (leaves.length > 0 && (!leaf || leaf.view?.file?.path !== session.notePath))) {
        this.disposePlayer(preview);
      }
    }
  }

  async mountPlayer(host, note, source) {
    if (!await waitForAttachment(host)) return;
    const preview = host.closest(".markdown-preview-view") || host.closest(".markdown-reading-view") || host.parentElement;
    if (!preview) return;
    host.classList.add("oca-player-placeholder");
    host.textContent = "视频已固定在笔记顶部，向下阅读字幕时会继续播放。";
    this.playerSessions ??= new Map();
    const previous = this.playerSessions.get(preview);
    if (previous?.notePath === note.path && previous.source === source && preview.contains(previous.dock)) {
      await previous.ready;
      return;
    }
    if (previous) this.disposePlayer(preview);

    const dock = document.createElement("section");
    dock.className = "oca-player-dock";
    preview.prepend(dock);
    host.hidden = true;
    const session = { notePath: note.path, source, dock, progressTimer: null, click: null, keydown: null,
      observer: null, ready: null,
      frameName: `oca-player-${crypto.randomUUID()}`, polling: false };
    this.playerSessions.set(preview, session);
    session.ready = this.populatePlayer(preview, session, note, source);
    await session.ready;
  }

  async dispatchYouTubeFrame(iframe, note) {
    const source = iframe.getAttribute("src");
    const videoId = youtubeEmbedId(source);
    if (!videoId) return;
    let markdown;
    try { markdown = await this.app.vault.cachedRead(note); } catch { return; }
    if (youtubeIdFromNote(markdown) !== videoId || !iframe.isConnected) return;
    const host = document.createElement("section");
    host.className = "oca-note-player";
    iframe.replaceWith(host);
    await this.mountYouTubePlayer(host, note, source, markdown, videoId);
  }

  async mountYouTubePlayer(host, note, source, markdown, videoId) {
    if (!await waitForAttachment(host)) return;
    const preview = host.closest(".markdown-preview-view") || host.closest(".markdown-reading-view");
    if (!preview) return;
    host.classList.add("oca-player-placeholder");
    host.textContent = "视频已固定在笔记顶部，向下阅读字幕时会继续播放。";
    this.playerSessions ??= new Map();
    const previous = this.playerSessions.get(preview);
    if (previous?.notePath === note.path && previous.source === source && previous.videoId === videoId && preview.contains(previous.dock)) {
      host.hidden = true;
      return;
    }
    if (previous) this.disposePlayer(preview);
    const dock = document.createElement("section");
    dock.className = "oca-player-dock oca-youtube-dock";
    preview.prepend(dock);
    host.hidden = true;
    const session = { notePath: note.path, source, videoId, dock, progressTimer: null, observer: null,
      click: null, keydown: null, controller: null };
    this.playerSessions.set(preview, session);
    const cues = parseTranscript(markdown);
    const header = dock.createDiv({ cls: "oca-player-header" });
    header.createSpan({ text: cues.length ? "YouTube · 笔记字幕联动" : "YouTube · 笔记视频", cls: "oca-player-title" });
    const status = dock.createDiv({ text: cues.length ? "播放器准备中…" : "播放器准备中… 无时间轴文字不支持跳转或高亮。", cls: "oca-player-hint" });
    status.setAttribute("role", "status");
    const iframe = dock.createEl("iframe", { cls: "oca-iframe" });
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-presentation");
    iframe.setAttribute("allow", "autoplay; encrypted-media; fullscreen; picture-in-picture");
    iframe.setAttribute("allowfullscreen", "true");
    iframe.src = source;
    const transport = dock.createDiv({ cls: "oca-youtube-transport" });
    const slider = transport.createEl("input", { cls: "oca-youtube-seek" });
    slider.type = "range";
    slider.min = "0";
    slider.max = "0";
    slider.step = "1";
    slider.value = "0";
    slider.disabled = true;
    slider.setAttribute("aria-label", "视频播放进度");
    const clock = transport.createSpan({ text: "00:00 / --:--", cls: "oca-youtube-time" });
    let duration = 0;
    let scrubbing = false;
    slider.addEventListener("input", () => {
      scrubbing = true;
      clock.textContent = `${videoClock(slider.value)} / ${videoClock(duration)}`;
    });
    slider.addEventListener("change", () => {
      if (slider.disabled || !session.controller) { scrubbing = false; return; }
      const target = Number(slider.value);
      void session.controller.seek(target).catch(error => {
        if (this.playerSessions.get(preview) === session) status.textContent = error.message;
      }).finally(() => { scrubbing = false; });
    });
    let showProgress = () => {};
    if (cues.length) {
      const transcript = dock.createDiv({ cls: "oca-transcript" });
      const buttons = [];
      for (const cue of cues) {
        const button = transcript.createEl("button", { cls: "oca-cue" });
        button.createSpan({ text: cue.stamp, cls: "oca-cue-time" });
        button.createSpan({ text: cue.text, cls: "oca-cue-text" });
        buttons.push(button);
      }
      let activeCue = -1;
      let resumeFollowingAt = 0;
      const pauseFollowing = () => { resumeFollowingAt = Date.now() + 3000; };
      for (const type of ["wheel", "touchstart", "pointerdown", "keydown"]) transcript.addEventListener(type, pauseFollowing);
      showProgress = (seconds) => {
        let index = -1;
        for (let i = 0; i < cues.length; i++) {
          if (cues[i].seconds <= seconds) index = i;
          else break;
        }
        if (index !== activeCue) {
          if (activeCue >= 0) buttons[activeCue].removeClass("is-active");
          activeCue = index;
          if (index >= 0) buttons[index].addClass("is-active");
        }
        if (index >= 0 && Date.now() >= resumeFollowingAt) {
          const row = buttons[index];
          const top = row.offsetTop;
          const bottom = top + row.offsetHeight;
          const viewportTop = transcript.scrollTop;
          const viewportBottom = viewportTop + transcript.clientHeight;
          if (top < viewportTop || bottom > viewportBottom) {
            transcript.scrollTop = Math.max(0, top - Math.max(0, (transcript.clientHeight - row.offsetHeight) / 2));
          }
        }
      };
      const seek = async (seconds) => {
        status.textContent = "正在跳转笔记视频…";
        try {
          if (!session.controller) throw new Error("笔记视频还未准备好，请稍后重试。");
          await session.controller.seek(seconds);
          if (this.playerSessions.get(preview) === session) status.textContent = "已跳转笔记内视频。";
        } catch (error) {
          if (this.playerSessions.get(preview) === session) status.textContent = error.message;
        }
      };
      buttons.forEach((button, index) => button.addEventListener("click", () => void seek(cues[index].seconds)));
      session.click = (event) => {
        if (dock.contains(event.target)) return;
        const code = event.target.closest?.("code");
        if (code && !code.closest("pre") && /^\d{2}:\d{2}(?::\d{2})?$/.test(code.textContent.trim())) {
          const linked = code.closest("a[href]");
          if (linked && !youtubeLinkMatches(linked.href, videoId, secondsFromStamp(code.textContent.trim()))) return;
          event.preventDefault(); event.stopPropagation();
          void seek(secondsFromStamp(code.textContent.trim()));
          return;
        }
        const anchor = event.target.closest?.("a[href]");
        if (!anchor || !/^\d{2}:\d{2}(?::\d{2})?$/.test(anchor.textContent.trim())) return;
        const seconds = secondsFromStamp(anchor.textContent.trim());
        if (!youtubeLinkMatches(anchor.href, videoId, seconds)) return;
        event.preventDefault(); event.stopPropagation();
        void seek(seconds);
      };
      preview.addEventListener("click", session.click, true);
      session.keydown = (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const code = event.target.closest?.("code.oca-note-timestamp");
        if (!code || dock.contains(code)) return;
        const linked = code.closest("a[href]");
        if (linked && !youtubeLinkMatches(linked.href, videoId, secondsFromStamp(code.textContent.trim()))) return;
        event.preventDefault(); event.stopPropagation();
        void seek(secondsFromStamp(code.textContent.trim()));
      };
      preview.addEventListener("keydown", session.keydown, true);
      const prepare = () => {
        for (const code of preview.querySelectorAll("code")) {
          if (dock.contains(code) || code.closest("pre") || !/^\d{2}:\d{2}(?::\d{2})?$/.test(code.textContent.trim())) continue;
          const linked = code.closest("a[href]");
          if (linked && !youtubeLinkMatches(linked.href, videoId, secondsFromStamp(code.textContent.trim()))) continue;
          code.classList.add("oca-note-timestamp");
          code.setAttribute("role", "button");
          code.setAttribute("tabindex", "0");
        }
      };
      prepare();
      session.observer = new MutationObserver(prepare);
      session.observer.observe(preview, { childList: true, subtree: true });
    }
    try {
      if (!this.youtubeControllerFactory) {
        const modulePath = path.join(this.app.vault.adapter.getBasePath(), this.app.vault.configDir || ".obsidian",
          "plugins", this.manifest.id, "youtube-player.js");
        this.youtubeControllerFactory = require(modulePath).createYouTubeController;
      }
      session.controller = this.youtubeControllerFactory(iframe, videoId, {
        onReady: () => { if (this.playerSessions.get(preview) === session) status.textContent = cues.length
          ? "点击字幕时间可跳转，播放进度会高亮字幕。" : "视频可在笔记内播放。文字无时间轴，不支持按字幕跳转或高亮。"; },
        onTime: (seconds) => { if (cues.length && this.playerSessions.get(preview) === session) showProgress(seconds); },
        onProgress: (progress) => {
          if (this.playerSessions.get(preview) !== session) return;
          if (Number.isFinite(progress.duration) && progress.duration > 0) {
            duration = progress.duration;
            slider.max = String(Math.ceil(duration));
            slider.disabled = false;
          }
          if (!scrubbing) {
            slider.value = String(Math.min(progress.seconds, duration || progress.seconds));
            clock.textContent = `${videoClock(progress.seconds)} / ${duration ? videoClock(duration) : "--:--"}`;
          }
        },
        onError: (error) => { if (this.playerSessions.get(preview) === session) status.textContent = error.message; },
      });
    } catch (error) { status.textContent = error.message; }
  }

  async populatePlayer(preview, session, note, source) {
    const { dock } = session;
    const header = dock.createDiv({ cls: "oca-player-header" });
    header.createSpan({ text: "笔记字幕 · 视频联动", cls: "oca-player-title" });
    const status = dock.createDiv({ text: "点击字幕时间可跳转上方视频，播放进度会高亮字幕。", cls: "oca-player-hint", attr: { role: "status" } });
    const iframe = dock.createEl("iframe", { cls: "oca-iframe" });
    iframe.name = session.frameName;
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-presentation");
    const playerUrl = new URL(source);
    playerUrl.searchParams.set("oca_instance", session.frameName);
    session.playerSource = playerUrl.toString();
    iframe.src = session.playerSource;
    iframe.setAttribute("allow", "fullscreen; picture-in-picture");
    iframe.setAttribute("allowfullscreen", "true");

    let markdown;
    try { markdown = await this.app.vault.cachedRead(note); }
    catch { status.textContent = "字幕读取失败，视频仍可播放。"; return; }
    if (this.playerSessions.get(preview) !== session) return;
    const cues = parseTranscript(markdown);
    const sourceUrl = new URL(source);
    const page = Math.max(1, Number(sourceUrl.searchParams.get("page") || sourceUrl.searchParams.get("p") || 1));

    const seek = async (seconds) => {
      status.textContent = "正在跳转笔记视频…";
      try {
        if (!this.embeddedVideo) throw new Error("当前 Obsidian 版本无法控制笔记内视频。");
        await this.embeddedVideo.run(session.frameName, session.playerSource, seconds);
        status.textContent = `已跳转笔记视频至 ${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}。`;
      } catch (error) {
        if (error.diagnostic) this.writeFrameDiagnostic(error.diagnostic);
        status.textContent = error.message;
        new Notice(error.message);
      }
    };

    const transcript = dock.createDiv({ cls: "oca-transcript" });
    const cueButtons = [];
    if (!cues.length) transcript.createDiv({ text: "这篇笔记没有带时间戳的字幕。", cls: "oca-player-hint" });
    for (const cue of cues) {
      const button = transcript.createEl("button", { cls: "oca-cue" });
      button.createSpan({ text: cue.stamp, cls: "oca-cue-time" });
      button.createSpan({ text: cue.text, cls: "oca-cue-text" });
      button.addEventListener("click", () => void seek(cue.seconds));
      cueButtons.push(button);
    }
    let activeCue = -1;
    const showProgress = (seconds) => {
      let index = -1;
      for (let i = 0; i < cues.length; i++) {
        if (cues[i].seconds <= seconds) index = i;
        else break;
      }
      if (index === activeCue) return;
      if (activeCue >= 0) cueButtons[activeCue].removeClass("is-active");
      activeCue = index;
      if (activeCue >= 0) cueButtons[activeCue].addClass("is-active");
    };
    const poll = async () => {
      if (session.polling || this.playerSessions.get(preview) !== session || !this.embeddedVideo) return;
      session.polling = true;
      try {
        const progress = await this.embeddedVideo.run(session.frameName, session.playerSource);
        if (this.playerSessions.get(preview) === session) showProgress(progress.seconds);
      } catch { /* The iframe may still be loading or navigating. */ }
      finally { session.polling = false; }
    };
    session.progressTimer = setInterval(() => void poll(), 750);
    void poll();
    // Existing Markdown timestamp links remain usable, including notes saved before this companion plugin.
    session.click = (event) => {
        const code = event.target.closest?.("code");
        if (code && !dock.contains(code) && !code.closest("pre")) {
          const stamp = code.textContent.trim();
          if (/^\d{2}:\d{2}(?::\d{2})?$/.test(stamp)) {
            event.preventDefault();
            event.stopPropagation();
            void seek(secondsFromStamp(stamp));
            return;
          }
        }
        const anchor = event.target.closest?.("a[href]");
        if (!anchor || dock.contains(anchor)) return;
        let url;
        try { url = new URL(anchor.href); } catch { return; }
        if (url.hostname !== "player.bilibili.com" || url.pathname !== "/player.html") return;
        if (url.searchParams.get("bvid") !== sourceUrl.searchParams.get("bvid")) return;
        if (Number(url.searchParams.get("p") || url.searchParams.get("page") || 1) !== page) return;
        const seconds = Number(url.searchParams.get("t"));
        if (!Number.isFinite(seconds) || seconds < 0) return;
        event.preventDefault();
        event.stopPropagation();
        void seek(seconds);
    };
    preview.addEventListener("click", session.click, true);
    session.keydown = (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const code = event.target.closest?.("code.oca-note-timestamp");
      if (!code || dock.contains(code)) return;
      event.preventDefault();
      event.stopPropagation();
      void seek(secondsFromStamp(code.textContent.trim()));
    };
    preview.addEventListener("keydown", session.keydown, true);
    prepareTimestampControls(preview, dock, source);
    session.observer = new MutationObserver(() => prepareTimestampControls(preview, dock, source));
    session.observer.observe(preview, { childList: true, subtree: true });
  }
};

module.exports._test = { parseTranscript, secondsFromStamp, bilibiliEmbedUrl, EmbeddedVideo };
