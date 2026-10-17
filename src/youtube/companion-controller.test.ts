import { describe, expect, it, vi, afterEach } from 'vitest';
const { JSDOM } = require('jsdom');
const playerModule = new URL('../../obsidian-clipper-anything-player/youtube-player.js', import.meta.url).pathname;
afterEach(() => { vi.useRealTimers(); vi.resetModules(); });
function frame(src = 'https://www.youtube.com/embed/M7lc1UVf-VE?enablejsapi=1') {
  const dom = new JSDOM('<!doctype html><body></body>');
  const iframe = dom.window.document.createElement('iframe'); iframe.src = src; dom.window.document.body.appendChild(iframe);
  return iframe;
}
describe('YouTube note-local IFrame controller', () => {
  it('owns one player, preserves paused seek and reports actual progress', async () => {
    vi.useFakeTimers();
    const { createYouTubeController } = require(playerModule);
    const iframe = frame();
    const onTime = vi.fn(); const onReady = vi.fn();
    let events: any; let state = 2; let time = 1;
    const player = { getPlayerState: vi.fn(() => state), getCurrentTime: vi.fn(() => time), seekTo: vi.fn((value: number) => { time = value; }), cueVideoById: vi.fn(), destroy: vi.fn(), playVideo: vi.fn() };
    const Player = vi.fn(function (_iframe, options) { events = options.events; return player; });
    const deps = { loadApi: async () => ({ Player }), setInterval, clearInterval, setTimeout, clearTimeout };
    const controller = createYouTubeController(iframe, 'M7lc1UVf-VE', { onTime, onReady }, deps);
    expect(createYouTubeController(iframe, 'M7lc1UVf-VE', { onTime }, deps)).toBe(controller);
    await vi.waitFor(() => expect(events).toBeDefined()); events.onReady({ target: player });
    await controller.seek(65);
    expect(Player).toHaveBeenCalledTimes(1);
    expect(player.seekTo).toHaveBeenCalledWith(65, true);
    expect(player.playVideo).not.toHaveBeenCalled();
    expect(player.getPlayerState()).toBe(2);
    await vi.advanceTimersByTimeAsync(800);
    expect(onTime).toHaveBeenCalledWith(65);
    expect(onReady).toHaveBeenCalledTimes(1);
    controller.destroy();
    expect(player.destroy).toHaveBeenCalledTimes(1);
    onTime.mockClear(); await vi.advanceTimersByTimeAsync(1500);
    expect(onTime).not.toHaveBeenCalled();
  });
  it('reports duration with progress so the note can enable a scrubber after metadata loads', async () => {
    vi.useFakeTimers();
    const { createYouTubeController } = require(playerModule);
    const iframe = frame();
    const onProgress = vi.fn();
    let events: any; let duration = 0; let seconds = 4;
    const player = { getCurrentTime: () => seconds, getDuration: () => duration, getPlayerState: () => 2,
      seekTo: vi.fn((value: number) => { seconds = value; }), destroy: vi.fn() };
    const controller = createYouTubeController(iframe, 'M7lc1UVf-VE', { onProgress }, {
      loadApi: async () => ({ Player: function (_iframe: any, options: any) { events = options.events; return player; } }),
      setInterval, clearInterval, setTimeout, clearTimeout,
    });
    await vi.waitFor(() => expect(events).toBeDefined()); events.onReady({ target: player });
    await vi.advanceTimersByTimeAsync(800);
    expect(onProgress).toHaveBeenLastCalledWith({ seconds: 4, duration: 0 });
    duration = 52;
    await vi.advanceTimersByTimeAsync(800);
    expect(onProgress).toHaveBeenLastCalledWith({ seconds: 4, duration: 52 });
    await controller.seek(30);
    expect(player.seekTo).toHaveBeenCalledWith(30, true);
    controller.destroy();
  });
  it('cues without autoplay before first play', async () => {
    const { createYouTubeController } = require(playerModule);
    const iframe = frame(); let events: any;
    const player = { getPlayerState: () => 5, getCurrentTime: () => 0, seekTo: vi.fn(), cueVideoById: vi.fn(), destroy: vi.fn() };
    const controller = createYouTubeController(iframe, 'M7lc1UVf-VE', {}, { loadApi: async () => ({ Player: function (_frame: any, options: any) { events = options.events; return player; } }) });
    await vi.waitFor(() => expect(events).toBeDefined()); events.onReady({ target: player });
    await controller.seek(20);
    expect(player.cueVideoById).toHaveBeenCalledWith({ videoId: 'M7lc1UVf-VE', startSeconds: 20 });
    expect(player.seekTo).not.toHaveBeenCalled();
    controller.destroy();
  });
  it('rejects a mismatched or non-YouTube iframe', () => {
    const { createYouTubeController } = require(playerModule);
    expect(() => createYouTubeController(frame('https://www.youtube.com/embed/abcdefghijk?enablejsapi=1'), 'M7lc1UVf-VE', {})).toThrow();
    expect(() => createYouTubeController(frame('https://youtube.com.evil.test/embed/M7lc1UVf-VE'), 'M7lc1UVf-VE', {})).toThrow();
  });
  it('reports API timeout and embedded player error, then stops', async () => {
    vi.useFakeTimers();
    const { createYouTubeController } = require(playerModule);
    const onError = vi.fn();
    const fail = createYouTubeController(frame(), 'M7lc1UVf-VE', { onError }, { loadApi: () => new Promise(() => {}), setTimeout, clearTimeout, setInterval, clearInterval, timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(101);
    expect(onError).toHaveBeenCalledTimes(1);
    await expect(fail.seek(10)).rejects.toThrow();
    fail.destroy();
    const player = { destroy: vi.fn(), getCurrentTime: () => 0, getPlayerState: () => 5 };
    let events: any;
    const blocked = createYouTubeController(frame(), 'M7lc1UVf-VE', { onError }, { loadApi: async () => ({ Player: function (_frame: any, options: any) { events = options.events; return player; } }), setTimeout, clearTimeout, setInterval, clearInterval });
    await vi.waitFor(() => expect(events).toBeDefined()); events.onError({ data: 150 });
    expect(onError).toHaveBeenCalledTimes(2);
    blocked.destroy();
  });
});
