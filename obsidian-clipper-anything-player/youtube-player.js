'use strict';
const controllers = new WeakMap();
const apiLoads = new WeakMap();

function validatedId(iframe, noteId) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(String(noteId || ''))) throw new Error('YouTube 视频 ID 无效。');
  const url = new URL(iframe.getAttribute('src') || iframe.src);
  const match = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})$/);
  if (url.protocol !== 'https:' || url.hostname !== 'www.youtube.com' || !match || match[1] !== noteId) throw new Error('笔记播放器与视频 ID 不匹配。');
  return noteId;
}

function loadYouTubeApi(iframe) {
  const document = iframe.ownerDocument;
  const view = document.defaultView;
  if (view.YT?.Player) return Promise.resolve(view.YT);
  if (apiLoads.has(document)) return apiLoads.get(document);
  const loading = new Promise((resolve, reject) => {
    const oldReady = view.onYouTubeIframeAPIReady;
    view.onYouTubeIframeAPIReady = () => {
      try { if (typeof oldReady === 'function') oldReady(); } catch { /* Another consumer cannot block ours. */ }
      if (view.YT?.Player) resolve(view.YT);
      else reject(new Error('YouTube 播放器接口未准备好。'));
    };
    const present = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!present) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => reject(new Error('无法加载 YouTube 播放器接口，请检查网络。'));
      (document.head || document.body).appendChild(script);
    }
  });
  apiLoads.set(document, loading);
  loading.catch(() => apiLoads.delete(document));
  return loading;
}

function createYouTubeController(iframe, videoId, callbacks = {}, dependencies = {}) {
  validatedId(iframe, videoId);
  const existing = controllers.get(iframe);
  if (existing) return existing;
  const setTimer = dependencies.setTimeout || setTimeout;
  const clearTimer = dependencies.clearTimeout || clearTimeout;
  const setPoll = dependencies.setInterval || setInterval;
  const clearPoll = dependencies.clearInterval || clearInterval;
  const loadApi = dependencies.loadApi || loadYouTubeApi;
  const timeoutMs = dependencies.timeoutMs || 15000;
  let player = null;
  let timer = null;
  let timeout = null;
  let destroyed = false;
  let settled = false;
  let failed = false;
  let failureReason = null;
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  ready.catch(() => {});
  const fail = error => {
    if (destroyed || failed) return;
    failed = true;
    clearTimer(timeout);
    if (timer) clearPoll(timer);
    const failure = error instanceof Error ? error : new Error(String(error));
    failureReason = failure;
    callbacks.onError?.(failure);
    if (!settled) { settled = true; rejectReady(failure); }
  };
  timeout = setTimer(() => fail(new Error('YouTube 笔记播放器准备超时，请检查网络或嵌入权限。')), timeoutMs);
  Promise.resolve().then(() => loadApi(iframe)).then(api => {
    if (destroyed || failed) return;
    player = new api.Player(iframe, { events: {
      onReady(event) {
        if (destroyed || settled || failed) return;
        player = event.target || player;
        settled = true;
        clearTimer(timeout);
        resolveReady(player);
        callbacks.onReady?.();
        timer = setPoll(() => {
          if (destroyed) return;
          try {
            const seconds = Number(player.getCurrentTime());
            if (!Number.isFinite(seconds) || seconds < 0) return;
            callbacks.onTime?.(seconds);
            const reported = Number(player.getDuration?.());
            const duration = Number.isFinite(reported) && reported > 0 ? reported : 0;
            callbacks.onProgress?.({ seconds, duration });
          }
          catch { /* Navigation may briefly interrupt an otherwise healthy player. */ }
        }, 750);
      },
      onError(event) {
        const code = Number(event?.data);
        fail(new Error(code === 150 || code === 101 ? '此视频不允许嵌入播放。' : `YouTube 播放器错误（${code || '未知'}）。`));
      },
    } });
  }).catch(fail);
  const controller = {
    async seek(seconds) {
      if (destroyed) throw new Error('播放器已关闭。');
      if (failed) throw failureReason;
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error('字幕时间无效。');
      const current = await ready;
      if (destroyed) throw new Error('播放器已关闭。');
      if (failed) throw failureReason;
      if (current.getPlayerState() === 5) current.cueVideoById({ videoId, startSeconds: seconds });
      else current.seekTo(seconds, true);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimer(timeout);
      if (timer) clearPoll(timer);
      if (!settled) { settled = true; rejectReady(new Error('播放器已关闭。')); }
      try { player?.destroy(); } catch { /* Frame might already be detached. */ }
      controllers.delete(iframe);
    },
  };
  controllers.set(iframe, controller);
  return controller;
}

module.exports = { createYouTubeController, validatedId, loadYouTubeApi };
