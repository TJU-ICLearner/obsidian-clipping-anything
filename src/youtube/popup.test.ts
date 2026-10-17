import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
const { JSDOM } = require('jsdom');
const watch = 'https://www.youtube.com/watch?v=M7lc1UVf-VE';
function loadPopup() {
  const scope: any = { URL, document: { getElementById: () => null }, TextEncoder, crypto: { getRandomValues: (array: Uint8Array) => array.fill(1) } };
  scope.globalThis = scope;
  vm.runInNewContext(readFileSync(new URL('./note.js', import.meta.url), 'utf8'), scope);
  vm.runInNewContext(readFileSync(new URL('./popup.js', import.meta.url), 'utf8'), scope);
  return scope.OcaYouTubePopup;
}
function routed(url: string) {
  let route = '';
  const scope: any = { URL, chrome: { tabs: { query: (_args: any, cb: any) => cb([{ url }]) }, runtime: { getURL: (path: string) => path } }, location: { replace: (path: string) => route = path } };
  vm.runInNewContext(readFileSync(new URL('../router.js', import.meta.url), 'utf8'), scope);
  return route;
}
describe('YouTube popup route and actions', () => {
  it('routes standard YouTube watch and Shorts pages to the dedicated popup', () => {
    expect(routed(watch)).toBe('youtube/popup.html');
    expect(routed('https://www.youtube.com/shorts/_i92TmBGF8k')).toBe('youtube/popup.html');
    expect(routed('https://www.youtube.com/watch?v=bad')).toBe('popup.html');
    expect(routed('https://www.youtube.com/shorts/bad')).toBe('popup.html');
    expect(routed('https://www.bilibili.com/video/BV1x')).toBe('bilibili/popup.html');
  });
  it('loads the collector on YouTube home before SPA navigation to watch or Shorts', () => {
    const manifest = JSON.parse(readFileSync(new URL('../manifest.chrome.json', import.meta.url), 'utf8'));
    const collector = manifest.content_scripts.find((entry: any) => entry.js.includes('youtube/content.js'));
    expect(collector.matches).toContain('https://www.youtube.com/*');
    expect(routed(watch)).toBe('youtube/popup.html');
    expect(routed('https://www.youtube.com/shorts/_i92TmBGF8k')).toBe('youtube/popup.html');
  });
  it('validates the same active tab and video before copy or save', async () => {
    const popup = loadPopup();
    const tabs = { query: vi.fn(async () => [{ id: 7, url: watch }]), get: vi.fn(async () => ({ id: 7, url: watch })) };
    expect(await popup.validateSnapshotTab(tabs, { tabId: 7, videoId: 'M7lc1UVf-VE' })).toBe(true);
    tabs.query.mockResolvedValue([{ id: 7, url: 'https://www.youtube.com/shorts/_i92TmBGF8k' }]);
    expect(await popup.validateSnapshotTab(tabs, { tabId: 7, videoId: '_i92TmBGF8k' })).toBe(true);
    tabs.query.mockResolvedValue([{ id: 8, url: watch }]);
    expect(await popup.validateSnapshotTab(tabs, { tabId: 7, videoId: 'M7lc1UVf-VE' })).toBe(false);
    tabs.query.mockResolvedValue([{ id: 7, url: 'https://www.youtube.com/watch?v=abcdefghijk' }]);
    expect(await popup.validateSnapshotTab(tabs, { tabId: 7, videoId: 'M7lc1UVf-VE' })).toBe(false);
  });
  it('explains absent and potentially incomplete visible transcripts', () => {
    const popup = loadPopup();
    expect(popup.transcriptSummary({ transcriptState: 'unopened', cues: [] })).toContain('在 YouTube 打开文字记录后，点击这里的刷新');
    expect(popup.transcriptSummary({ transcriptState: 'possibly-incomplete', cues: [{ start: 1, text: 'a' }] })).toContain('1 条');
    expect(popup.transcriptSummary({ transcriptState: 'possibly-incomplete', cues: [{ start: 1, text: 'a' }] })).toContain('可能不完整');
    expect(popup.transcriptSummary({ transcriptState: 'complete', cues: [{ start: 1, text: 'a' }] })).toContain('已遍历');
    expect(popup.canSave({ videoId: 'M7lc1UVf-VE', cues: [] })).toBe(true);
  });
  it('warns that an uncaptioned Shorts clip will save only video information', () => {
    const popup = loadPopup();
    const status = popup.transcriptSummary({
      videoId: '_i92TmBGF8k', url: 'https://www.youtube.com/shorts/_i92TmBGF8k',
      transcriptState: 'unopened', cues: [],
    });
    expect(status).toContain('只会保存视频信息');
    expect(status).toContain('普通播放页');
  });
  it('describes the untimed description fallback without promising seeking or highlighting', () => {
    const popup = loadPopup();
    const status = popup.transcriptSummary({
      videoId: '_i92TmBGF8k', url: 'https://www.youtube.com/shorts/_i92TmBGF8k',
      transcriptState: 'unopened', cues: [],
      description: '第一句话介绍芯片的组成。第二句话解释处理器的作用。第三句话继续讲解不同部件的功能。第四句话介绍它们怎样协同工作。第五句话说明集成的好处。',
    });
    expect(status).toContain('无时间');
    expect(status).not.toContain('只会保存视频信息');
    expect(status).toContain('不能按字幕跳转或高亮');
    expect(popup.transcriptSummary({ transcriptState: 'complete', cues: [], description: '第一句话介绍芯片的组成。第二句话解释处理器的作用。第三句话继续讲解不同部件的功能。第四句话介绍它们怎样协同工作。第五句话说明集成的好处。' })).toContain('无时间轴');
  });
  it('asks to open available captions before treating a description excerpt as a transcript', () => {
    const popup = loadPopup();
    const status = popup.transcriptSummary({
      videoId: 'x4DL9SRA3Og', url: 'https://www.youtube.com/watch?v=x4DL9SRA3Og',
      transcriptState: 'unopened', cues: [], captionsAvailable: true,
      description: '第一句话介绍芯片的组成。第二句话解释处理器的作用。第三句话继续讲解不同部件的功能。第四句话介绍它们怎样协同工作。第五句话说明集成的好处。',
    });
    expect(status).toContain('有字幕');
    expect(status).toContain('显示文字记录');
    expect(status).toContain('刷新');
    expect(status).toContain('简介摘录');
    expect(status).toContain('非完整字幕');
  });
  it('offers a same-tab watch-page button only for Shorts without visible cues', async () => {
    const short = 'https://www.youtube.com/shorts/_i92TmBGF8k';
    const html = readFileSync(new URL('./popup.html', import.meta.url), 'utf8').replace(/<script[^>]*><\/script>/g, '');
    const dom = new JSDOM(html, { url: 'chrome-extension://test/youtube/popup.html' });
    const document = dom.window.document;
    const snapshot = { videoId: '_i92TmBGF8k', title: 'SOC', channel: '', url: short, description: '', chapters: [], cues: [] as Array<{ start: number; text: string }>, transcriptState: 'unopened' };
    const update = vi.fn(async () => undefined);
    const chrome = {
      tabs: { query: vi.fn(async () => [{ id: 7, url: short }]), sendMessage: vi.fn(async () => ({ ok: true, payload: snapshot })), update },
      storage: { sync: { get: vi.fn(async () => ({ vaults: [] })), set: vi.fn(async () => {}) }, local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) } },
      runtime: { openOptionsPage: vi.fn() },
    };
    const context: any = { URL, document, chrome, navigator: dom.window.navigator, crypto: dom.window.crypto, TextEncoder };
    context.globalThis = context;
    vm.runInNewContext(readFileSync(new URL('./note.js', import.meta.url), 'utf8'), context);
    vm.runInNewContext(readFileSync(new URL('./popup.js', import.meta.url), 'utf8'), context);
    await vi.waitFor(() => expect(document.getElementById('message')?.textContent).toBe('预览已更新。'));
    const button = document.getElementById('open-watch') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.hidden).toBe(false);
    button.click();
    await vi.waitFor(() => expect(update).toHaveBeenCalledWith(7, { url: 'https://www.youtube.com/watch?v=_i92TmBGF8k' }));
    snapshot.cues = [{ start: 1, text: 'Visible caption' }];
    snapshot.transcriptState = 'complete';
    document.getElementById('refresh')?.click();
    await vi.waitFor(() => expect(document.getElementById('transcript-status')?.textContent).toContain('1 条字幕'));
    expect(button.hidden).toBe(true);
  });
  it('has reciprocal web-mode link and independent YouTube settings controls', () => {
    const html = readFileSync(new URL('./popup.html', import.meta.url), 'utf8');
    const settings = readFileSync(new URL('../settings.html', import.meta.url), 'utf8');
    const web = readFileSync(new URL('../popup.html', import.meta.url), 'utf8');
    expect(html).toContain('../popup.html?from=youtube');
    expect(settings).toContain('youtube-settings-vault');
    expect(settings).toContain('youtube-settings-folder');
    expect(web).toContain('anything-youtube-link');
  });
});
