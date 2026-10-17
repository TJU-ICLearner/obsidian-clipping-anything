import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
const { JSDOM } = require('jsdom');
const watch = 'https://www.youtube.com/watch?v=M7lc1UVf-VE';
function loadPopup() {
  const scope: any = { URL, DOMParser: new JSDOM('').window.DOMParser, document: { getElementById: () => null }, TextEncoder, crypto: { getRandomValues: (array: Uint8Array) => array.fill(1) } };
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
  it('shows structural diagnostics for an opened transcript that yielded no timed rows', () => {
    const popup = loadPopup();
    const status = popup.transcriptSummary({
      videoId: 'x4DL9SRA3Og', url: 'https://www.youtube.com/watch?v=x4DL9SRA3Og',
      transcriptState: 'open-unrecognized', cues: [], captionsAvailable: true,
      transcriptDiagnostics: { panel: 1, expanded: 1, container: 0, rows: 0, timestamps: 1 },
      description: '第一句话介绍芯片的组成。第二句话解释处理器的作用。第三句话继续讲解不同部件的功能。第四句话介绍它们怎样协同工作。第五句话说明集成的好处。',
    });
    expect(status).toContain('已展开');
    expect(status).toContain('面板 1');
    expect(status).toContain('容器 0');
    expect(status).toContain('时间 1');
    expect(status).toContain('非完整字幕');
  });
  it('accepts timed transcript segments from web clipping only for the current video', () => {
    const popup = loadPopup();
    const html = '<iframe src="https://www.youtube.com/embed/fwdzsY9KWKk"></iframe><div class="youtube transcript">' +
      '<p class="transcript-segment"><strong><span class="timestamp" data-timestamp="0">0:00</span></strong> · AI Agent 是什么</p>' +
      '<p class="transcript-segment"><strong><span class="timestamp" data-timestamp="54">0:54</span></strong> · 先说结论</p></div>';
    expect(JSON.stringify(popup.parseWebTranscript(html, 'fwdzsY9KWKk'))).toBe(JSON.stringify([
      { start: 0, text: 'AI Agent 是什么' }, { start: 54, text: '先说结论' },
    ]));
    expect(popup.parseWebTranscript(html, 'x4DL9SRA3Og')).toHaveLength(0);
    expect(popup.parseWebTranscript('<iframe src="https://www.youtube.com/embed/fwdzsY9KWKk"></iframe><p>0:54 简介内容</p>', 'fwdzsY9KWKk')).toHaveLength(0);
  });
  it('recognizes the actual YouTube markup returned by the bundled web extractor', () => {
    const Defuddle = require('defuddle');
    const pageUrl = 'https://www.youtube.com/watch?v=fwdzsY9KWKk';
    const page = new JSDOM('<html><body><ytd-engagement-panel-section-list-renderer target-id="engagement-panel-searchable-transcript"><div id="segments-container">' +
      '<ytd-transcript-segment-renderer><span class="segment-timestamp">0:54</span><span class="segment-text">先说结论</span></ytd-transcript-segment-renderer>' +
      '</div></ytd-engagement-panel-section-list-renderer></body></html>', { url: pageUrl });
    const webResult = new Defuddle(page.window.document, { url: pageUrl }).parse();
    const popup = loadPopup();
    expect(JSON.stringify(popup.parseWebTranscript(webResult.content, 'fwdzsY9KWKk'))).toBe(JSON.stringify([{ start: 54, text: '先说结论' }]));
  });
  it('falls back to the web clipper timed transcript when the video collector finds none', async () => {
    const html = readFileSync(new URL('./popup.html', import.meta.url), 'utf8').replace(/<script[^>]*><\/script>/g, '');
    const dom = new JSDOM(html, { url: 'chrome-extension://test/youtube/popup.html' });
    const document = dom.window.document;
    const pageUrl = 'https://www.youtube.com/watch?v=fwdzsY9KWKk';
    const snapshot = { videoId: 'fwdzsY9KWKk', title: '15分鐘學會AI Agent｜完整講解', channel: '李厂长来了', url: pageUrl,
      description: '宣传简介。', chapters: [], cues: [], transcriptState: 'open-empty' };
    const webHtml = '<iframe src="https://www.youtube.com/embed/fwdzsY9KWKk"></iframe><div class="youtube transcript">' +
      '<p class="transcript-segment"><strong><span class="timestamp" data-timestamp="54">0:54</span></strong> · 先说结论</p></div>';
    const chrome = {
      tabs: { query: vi.fn(async () => [{ id: 7, url: pageUrl }]), sendMessage: vi.fn(async () => ({ ok: true, payload: snapshot })) },
      storage: { sync: { get: vi.fn(async () => ({ vaults: [] })), set: vi.fn(async () => {}) }, local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) } },
      runtime: { sendMessage: vi.fn(async () => ({ content: webHtml })), openOptionsPage: vi.fn() },
    };
    const context: any = { URL, document, DOMParser: dom.window.DOMParser, chrome, navigator: dom.window.navigator, crypto: dom.window.crypto, TextEncoder };
    context.globalThis = context;
    vm.runInNewContext(readFileSync(new URL('./note.js', import.meta.url), 'utf8'), context);
    vm.runInNewContext(readFileSync(new URL('./popup.js', import.meta.url), 'utf8'), context);
    await vi.waitFor(() => expect(document.getElementById('transcript-status')?.textContent).toContain('1 条带时间字幕'));
    expect((document.getElementById('markdown-preview') as HTMLTextAreaElement).value).toContain('`00:54` 先说结论');
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'sendMessageToTab', tabId: 7, message: { action: 'getPageContent' } });
  });
  it('reinjects the shared web collector when its first extraction request fails', async () => {
    const html = readFileSync(new URL('./popup.html', import.meta.url), 'utf8').replace(/<script[^>]*><\/script>/g, '');
    const dom = new JSDOM(html, { url: 'chrome-extension://test/youtube/popup.html' });
    const document = dom.window.document;
    const pageUrl = 'https://www.youtube.com/watch?v=fwdzsY9KWKk';
    const snapshot = { videoId: 'fwdzsY9KWKk', title: 'AI Agent', channel: '李厂长来了', url: pageUrl,
      description: '', chapters: [], cues: [], transcriptState: 'open-empty' };
    const webHtml = '<iframe src="https://www.youtube.com/embed/fwdzsY9KWKk"></iframe><div class="youtube transcript">' +
      '<p class="transcript-segment"><strong><span class="timestamp" data-timestamp="54">0:54</span></strong> · 先说结论</p></div>';
    const runtimeMessage = vi.fn().mockResolvedValueOnce({ success: false, error: 'Extension context invalidated' })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ content: webHtml });
    const chrome = {
      tabs: { query: vi.fn(async () => [{ id: 7, url: pageUrl }]), sendMessage: vi.fn(async () => ({ ok: true, payload: snapshot })) },
      storage: { sync: { get: vi.fn(async () => ({ vaults: [] })), set: vi.fn(async () => {}) }, local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) } },
      runtime: { sendMessage: runtimeMessage, openOptionsPage: vi.fn() },
    };
    const context: any = { URL, document, DOMParser: dom.window.DOMParser, chrome, navigator: dom.window.navigator, crypto: dom.window.crypto, TextEncoder };
    context.globalThis = context;
    vm.runInNewContext(readFileSync(new URL('./note.js', import.meta.url), 'utf8'), context);
    vm.runInNewContext(readFileSync(new URL('./popup.js', import.meta.url), 'utf8'), context);
    await vi.waitFor(() => expect(document.getElementById('transcript-status')?.textContent).toContain('1 条带时间字幕'));
    expect(runtimeMessage).toHaveBeenNthCalledWith(2, { action: 'forceInjectContentScript', tabId: 7 });
    expect(runtimeMessage).toHaveBeenCalledTimes(3);
  });
  it('shows the shared collector failure instead of silently reporting zero subtitles', async () => {
    const html = readFileSync(new URL('./popup.html', import.meta.url), 'utf8').replace(/<script[^>]*><\/script>/g, '');
    const dom = new JSDOM(html, { url: 'chrome-extension://test/youtube/popup.html' });
    const document = dom.window.document;
    const pageUrl = 'https://www.youtube.com/watch?v=fwdzsY9KWKk';
    const snapshot = { videoId: 'fwdzsY9KWKk', title: 'AI Agent', channel: '', url: pageUrl,
      description: '', chapters: [], cues: [], transcriptState: 'open-empty' };
    const runtimeMessage = vi.fn().mockRejectedValueOnce(new Error('first extraction failed'))
      .mockResolvedValueOnce({ success: false, error: 'Site access blocked' });
    const chrome = {
      tabs: { query: vi.fn(async () => [{ id: 7, url: pageUrl }]), sendMessage: vi.fn(async () => ({ ok: true, payload: snapshot })) },
      storage: { sync: { get: vi.fn(async () => ({ vaults: [] })), set: vi.fn(async () => {}) }, local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) } },
      runtime: { sendMessage: runtimeMessage, openOptionsPage: vi.fn() },
    };
    const context: any = { URL, document, DOMParser: dom.window.DOMParser, chrome, navigator: dom.window.navigator, crypto: dom.window.crypto, TextEncoder };
    context.globalThis = context;
    vm.runInNewContext(readFileSync(new URL('./note.js', import.meta.url), 'utf8'), context);
    vm.runInNewContext(readFileSync(new URL('./popup.js', import.meta.url), 'utf8'), context);
    await vi.waitFor(() => expect(document.getElementById('transcript-status')?.textContent).toContain('网页裁剪回退：连接失败：Site access blocked'));
    expect(runtimeMessage).toHaveBeenCalledTimes(2);
  });
  it('converts a closed message channel into a recovery instruction', () => {
    const popup = loadPopup();
    expect(popup.readError(new Error('A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received'))).toContain('刷新 YouTube 网页');
    expect(popup.readError(new Error('A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received'))).not.toContain('A listener indicated');
  });
  it('replaces the indefinite loading header when page reading disconnects', async () => {
    const html = readFileSync(new URL('./popup.html', import.meta.url), 'utf8').replace(/<script[^>]*><\/script>/g, '');
    const dom = new JSDOM(html, { url: 'chrome-extension://test/youtube/popup.html' });
    const document = dom.window.document;
    const chrome = {
      tabs: { query: vi.fn(async () => [{ id: 7, url: watch }]), sendMessage: vi.fn(async () => { throw new Error('A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received'); }) },
      storage: { sync: { get: vi.fn(async () => ({ vaults: [] })), set: vi.fn(async () => {}) }, local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) } },
      runtime: { openOptionsPage: vi.fn() },
    };
    const context: any = { URL, document, chrome, navigator: dom.window.navigator, crypto: dom.window.crypto, TextEncoder };
    context.globalThis = context;
    vm.runInNewContext(readFileSync(new URL('./note.js', import.meta.url), 'utf8'), context);
    vm.runInNewContext(readFileSync(new URL('./popup.js', import.meta.url), 'utf8'), context);
    await vi.waitFor(() => expect(document.getElementById('message')?.textContent).toContain('刷新 YouTube 网页'));
    expect(document.getElementById('title')?.textContent).toBe('读取失败');
    expect(document.getElementById('save')?.hasAttribute('disabled')).toBe(true);
  });
  it('reinjects the YouTube collector once when a reloaded extension has no receiver in the tab', async () => {
    const html = readFileSync(new URL('./popup.html', import.meta.url), 'utf8').replace(/<script[^>]*><\/script>/g, '');
    const dom = new JSDOM(html, { url: 'chrome-extension://test/youtube/popup.html' });
    const document = dom.window.document;
    const snapshot = { videoId: 'M7lc1UVf-VE', title: 'Current video', channel: 'Current channel', url: watch, description: '', chapters: [], cues: [], transcriptState: 'unopened' };
    const sendMessage = vi.fn().mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'))
      .mockResolvedValueOnce({ ok: true, payload: snapshot });
    const executeScript = vi.fn(async () => []);
    const chrome = {
      tabs: { query: vi.fn(async () => [{ id: 7, url: watch }]), sendMessage },
      scripting: { executeScript },
      storage: { sync: { get: vi.fn(async () => ({ vaults: [] })), set: vi.fn(async () => {}) }, local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) } },
      runtime: { openOptionsPage: vi.fn() },
    };
    const context: any = { URL, document, chrome, navigator: dom.window.navigator, crypto: dom.window.crypto, TextEncoder };
    context.globalThis = context;
    vm.runInNewContext(readFileSync(new URL('./note.js', import.meta.url), 'utf8'), context);
    vm.runInNewContext(readFileSync(new URL('./popup.js', import.meta.url), 'utf8'), context);
    await vi.waitFor(() => expect(document.getElementById('message')?.textContent).toBe('预览已更新。'));
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 7 }, files: ['youtube/video.js', 'youtube/content.js'] });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(document.getElementById('title')?.textContent).toBe('Current video');
    sendMessage.mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'));
    executeScript.mockRejectedValueOnce(new Error('Site access blocked'));
    document.getElementById('refresh')?.click();
    await vi.waitFor(() => expect(document.getElementById('message')?.textContent).toContain('刷新 YouTube 网页'));
    expect(sendMessage).toHaveBeenCalledTimes(3);
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
