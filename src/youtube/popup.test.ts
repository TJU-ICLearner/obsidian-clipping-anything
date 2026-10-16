import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
const watch = 'https://www.youtube.com/watch?v=M7lc1UVf-VE';
function loadPopup() {
  const scope: any = { URL, document: { getElementById: () => null } };
  scope.globalThis = scope;
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
  it('routes only a standard YouTube watch page to dedicated popup', () => {
    expect(routed(watch)).toBe('youtube/popup.html');
    expect(routed('https://www.youtube.com/shorts/M7lc1UVf-VE')).toBe('popup.html');
    expect(routed('https://www.youtube.com/watch?v=bad')).toBe('popup.html');
    expect(routed('https://www.bilibili.com/video/BV1x')).toBe('bilibili/popup.html');
  });
  it('validates the same active tab and video before copy or save', async () => {
    const popup = loadPopup();
    const tabs = { query: vi.fn(async () => [{ id: 7, url: watch }]), get: vi.fn(async () => ({ id: 7, url: watch })) };
    expect(await popup.validateSnapshotTab(tabs, { tabId: 7, videoId: 'M7lc1UVf-VE' })).toBe(true);
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
    expect(popup.canSave({ videoId: 'M7lc1UVf-VE', cues: [] })).toBe(true);
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
