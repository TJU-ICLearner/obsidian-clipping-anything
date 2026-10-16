import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const { JSDOM } = require('jsdom');

function loadCompanion(document?: Document, MutationObserver?: typeof globalThis.MutationObserver, remote?: any) {
  class Plugin { app: any; register() {} registerMarkdownPostProcessor() {} }
  class TFile { path: string; extension: string; constructor(path: string) { this.path = path; this.extension = path.split('.').pop()!; } }
  const sandbox = {
    module: { exports: {} as any },
    require: (id: string) => id === 'obsidian' ? { Plugin, Notice: class {}, TFile } : id === '@electron/remote' ? remote : require(id),
    URL,
    Buffer,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    document,
    MutationObserver,
  };
  vm.runInNewContext(
    readFileSync(new URL('../../obsidian-clipper-anything-player/main.js', import.meta.url), 'utf8'),
    sandbox,
  );
  return { Companion: sandbox.module.exports, TFile };
}

function installObsidianDomHelpers(document: Document) {
  const prototype = document.defaultView!.HTMLElement.prototype as any;
  prototype.createEl = function(tag: string, options: any = {}) {
    const node = document.createElement(tag);
    if (options.cls) node.className = options.cls;
    if (options.text) node.textContent = options.text;
    this.appendChild(node);
    return node;
  };
  prototype.createDiv = function(options: any = {}) { return this.createEl('div', options); };
  prototype.createSpan = function(options: any = {}) { return this.createEl('span', options); };
  prototype.addClass = function(name: string) { this.classList.add(name); };
  prototype.removeClass = function(name: string) { this.classList.remove(name); };
}

describe('Obsidian note player', () => {
  it('reads both current linked timestamps and older code timestamps', () => {
    const { Companion } = loadCompanion();
    const markdown = [
      '## 字幕',
      '',
      '[00:02](https://player.bilibili.com/player.html?bvid=BV123&t=2) 第一行',
      '`00:03` 旧笔记的第二行',
      '## 评论',
      '[00:04](https://player.bilibili.com/player.html?t=4) 不应收录',
    ].join('\n');
    expect(JSON.stringify(Companion._test.parseTranscript(markdown))).toBe(JSON.stringify([
      { stamp: '00:02', seconds: 2, text: '第一行' },
      { stamp: '00:03', seconds: 3, text: '旧笔记的第二行' },
    ]));
  });

  it('finds the embedded video after its frame URL changes but its unique name remains', () => {
    const frame = { name: 'oca-player-one', url: 'https://www.bilibili.com/blackboard/html5player.html' };
    const remote = { getCurrentWebContents: () => ({ mainFrame: { framesInSubtree: [frame] } }) };
    const { Companion } = loadCompanion(undefined, undefined, remote);
    const video = new Companion._test.EmbeddedVideo();

    expect(video.frame('oca-player-one', 'https://player.bilibili.com/player.html?bvid=BV123&page=1')).toBe(frame);
  });

  it('finds a unique Bilibili video frame when the frame name is lost', () => {
    const frame = { name: '', url: 'https://player.bilibili.com/player.html?bvid=BV123&page=1' };
    const remote = { getCurrentWebContents: () => ({ mainFrame: { framesInSubtree: [frame] } }) };
    const { Companion } = loadCompanion(undefined, undefined, remote);
    const video = new Companion._test.EmbeddedVideo();

    expect(video.frame('oca-player-one', frame.url)).toBe(frame);
  });

  it('does not guess which video to control when two unnamed frames match', () => {
    const url = 'https://player.bilibili.com/player.html?bvid=BV123&page=1';
    const frames = [{ name: '', url }, { name: '', url }];
    const remote = { getCurrentWebContents: () => ({ mainFrame: { framesInSubtree: frames } }) };
    const { Companion } = loadCompanion(undefined, undefined, remote);
    const video = new Companion._test.EmbeddedVideo();

    expect(video.frame('oca-player-one', url)).toBeUndefined();
  });

  it('selects the marked note player among two otherwise identical unnamed frames', () => {
    const url = 'https://player.bilibili.com/player.html?bvid=BV123&page=1';
    const markedUrl = `${url}&oca_instance=note-one`;
    const original = { name: '', url };
    const marked = { name: '', url: markedUrl };
    const remote = { getCurrentWebContents: () => ({ mainFrame: { framesInSubtree: [original, marked] } }) };
    const { Companion } = loadCompanion(undefined, undefined, remote);
    const video = new Companion._test.EmbeddedVideo();

    expect(video.frame('oca-player-one', markedUrl)).toBe(marked);
  });

  it('does not use an unmarked page iframe when the note player has not loaded', () => {
    const url = 'https://player.bilibili.com/player.html?bvid=BV123&page=1';
    const frame = { name: '', url };
    const remote = { getCurrentWebContents: () => ({ mainFrame: { framesInSubtree: [frame] } }) };
    const { Companion } = loadCompanion(undefined, undefined, remote);
    const video = new Companion._test.EmbeddedVideo();

    expect(video.frame('oca-player-one', `${url}&oca_instance=note-one`)).toBeUndefined();
  });

  it('does not match a different video when both frame URLs omit BVID', () => {
    const frame = { name: '', url: 'https://player.bilibili.com/player.html?aid=222&page=1' };
    const remote = { getCurrentWebContents: () => ({ mainFrame: { framesInSubtree: [frame] } }) };
    const { Companion } = loadCompanion(undefined, undefined, remote);
    const video = new Companion._test.EmbeddedVideo();

    expect(video.frame('oca-player-one', 'https://player.bilibili.com/player.html?aid=111&page=1')).toBeUndefined();
  });

  it('does not control a named frame that explicitly navigated to another BVID', () => {
    const frame = { name: 'oca-player-one', url: 'https://player.bilibili.com/player.html?bvid=BV999&page=1' };
    const remote = { getCurrentWebContents: () => ({ mainFrame: { framesInSubtree: [frame] } }) };
    const { Companion } = loadCompanion(undefined, undefined, remote);
    const video = new Companion._test.EmbeddedVideo();

    expect(video.frame('oca-player-one', 'https://player.bilibili.com/player.html?bvid=BV123&page=1')).toBeUndefined();
  });

  it('reports sanitized frame details when the note video cannot be located', async () => {
    const frames = [
      { name: '', url: 'https://player.bilibili.com/player.html?bvid=BV999&oca_instance=note-two&token=private-value' },
      { name: 'other', url: 'https://private.example/note?token=private-value' },
    ];
    const remote = { getCurrentWebContents: () => ({ mainFrame: { framesInSubtree: frames } }) };
    const { Companion } = loadCompanion(undefined, undefined, remote);
    const video = new Companion._test.EmbeddedVideo();

    let error: any;
    try { await video.run('oca-player-one', 'https://player.bilibili.com/player.html?bvid=BV123&page=1&oca_instance=note-one'); }
    catch (caught) { error = caught; }
    expect(error?.message).toBe('笔记视频还未准备好，请稍后重试。');
    expect(error?.diagnostic?.totalFrames).toBe(2);
    expect(error?.diagnostic?.candidates?.[0]?.bvid).toBe('BV999');
    expect(error?.diagnostic?.requested?.instance).toBe('note-one');
    expect(error?.diagnostic?.candidates?.[0]?.instance).toBe('note-two');
    expect(JSON.stringify(error?.diagnostic)).not.toContain('private-value');
  });

  it('seeks and tracks the marked note video when another identical iframe is open', async () => {
    const dom = new JSDOM('<div class="markdown-preview-view"><div id="host"></div></div>');
    const { document, MutationObserver } = dom.window;
    installObsidianDomHelpers(document);
    const video = { currentTime: 0, paused: false, duration: 120, readyState: 4 };
    const source = 'https://player.bilibili.com/player.html?bvid=BV123&page=2';
    let markedUrl = '';
    const frame = {
      name: '',
      get url() { return markedUrl; },
      executeJavaScript: async (code: string) => vm.runInNewContext(code, {
        document: { querySelector: () => video },
      }),
    };
    const remote = { getCurrentWebContents: () => ({ mainFrame: { framesInSubtree: [{ name: '', url: source }, frame] } }) };
    const { Companion, TFile } = loadCompanion(document, MutationObserver, remote);
    const player = new Companion();
    player.embeddedVideo = new Companion._test.EmbeddedVideo();
    player.app = { vault: { cachedRead: async () => '## 字幕\n\n`00:02` 第一行\n`00:05` 第二行' } };
    await player.mountPlayer(document.getElementById('host')!, new TFile('clip.md'), source);
    const iframe = document.querySelector('.oca-iframe') as HTMLIFrameElement;
    expect((document.getElementById('host') as HTMLElement).hidden).toBe(true);
    markedUrl = iframe.src;
    expect(iframe.name).toMatch(/^oca-player-/);
    expect(new URL(markedUrl).searchParams.get('oca_instance')).toBe(iframe.name);
    (document.querySelectorAll('.oca-cue') as NodeListOf<HTMLButtonElement>)[1].click();
    await vi.waitFor(() => expect(video.currentTime).toBe(5));
    expect(video.paused).toBe(false);
    expect(iframe.src).toBe(frame.url);

    video.currentTime = 2.5;
    await vi.waitFor(() => expect(document.querySelectorAll('.oca-cue')[0].classList.contains('is-active')).toBe(true));
    player.disposePlayer(document.querySelector('.markdown-preview-view'));
  });

  it('sends old timestamp links to the embedded player without opening a page', async () => {
    const dom = new JSDOM('<div class="markdown-preview-view"><div id="host"></div><a id="old" href="https://player.bilibili.com/player.html?bvid=BV123&p=2&t=9">00:09</a></div>');
    const { document, MutationObserver } = dom.window;
    installObsidianDomHelpers(document);
    const video = { currentTime: 0, paused: true, duration: 120 };
    let frameName = '';
    const frame = {
      get name() { return frameName; },
      url: 'https://player.bilibili.com/player.html?bvid=BV123&page=2',
      executeJavaScript: async (code: string) => vm.runInNewContext(code, { document: { querySelector: () => video } }),
    };
    const remote = { getCurrentWebContents: () => ({ mainFrame: { framesInSubtree: [frame] } }) };
    const { Companion, TFile } = loadCompanion(document, MutationObserver, remote);
    const note = new TFile('clip.md');
    const player = new Companion();
    player.embeddedVideo = new Companion._test.EmbeddedVideo();
    player.app = {
      vault: {
        cachedRead: async () => '## 字幕\n\n[00:02](https://player.bilibili.com/player.html?bvid=BV123&p=2&t=2) 第一行\n[00:05](https://player.bilibili.com/player.html?bvid=BV123&p=2&t=5) 第二行',
      },
    };
    const host = document.getElementById('host')!;
    await player.mountPlayer(host, note, 'https://player.bilibili.com/player.html?bvid=BV123&page=2');
    frameName = (document.querySelector('.oca-iframe') as HTMLIFrameElement).name;
    const preview = document.querySelector('.markdown-preview-view')!;
    const cues = preview.querySelectorAll('.oca-player-dock .oca-cue') as NodeListOf<HTMLButtonElement>;
    cues[1].click();
    await vi.waitFor(() => expect(video.currentTime).toBe(5));
    const old = document.getElementById('old')!;
    expect(old.tagName).toBe('CODE');
    expect(old.getAttribute('href')).toBeNull();
    const event = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
    old.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(video.currentTime).toBe(9));
    expect(new URL(preview.querySelector('.oca-player-dock iframe')!.getAttribute('src')!).searchParams.get('bvid')).toBe('BV123');
    video.currentTime = 5;
    await vi.waitFor(() => expect(cues[1].classList.contains('is-active')).toBe(true), { timeout: 3000 });
    video.currentTime = 2;
    await vi.waitFor(() => expect(cues[0].classList.contains('is-active')).toBe(true), { timeout: 3000 });
    expect(cues[0].classList.contains('is-active')).toBe(true);
    expect(cues[1].classList.contains('is-active')).toBe(false);
    player.disposePlayer(preview);
  });

  it('seeks the embedded video when a plain timestamp in the note is clicked', async () => {
    const dom = new JSDOM('<div class="markdown-preview-view"><div id="host"></div><p><code id="time">00:09</code> 一句字幕</p></div>');
    const { document, MutationObserver } = dom.window;
    installObsidianDomHelpers(document);
    const video = { currentTime: 0, paused: true, duration: 120 };
    let frameName = '';
    const frame = {
      get name() { return frameName; },
      url: 'https://player.bilibili.com/player.html?bvid=BV123&page=1',
      executeJavaScript: async (code: string) => vm.runInNewContext(code, { document: { querySelector: () => video } }),
    };
    const remote = { getCurrentWebContents: () => ({ mainFrame: { framesInSubtree: [frame] } }) };
    const { Companion, TFile } = loadCompanion(document, MutationObserver, remote);
    const player = new Companion();
    player.embeddedVideo = new Companion._test.EmbeddedVideo();
    player.app = { vault: { cachedRead: async () => '## 字幕\n\n`00:09` 一句字幕' } };
    await player.mountPlayer(document.getElementById('host')!, new TFile('clip.md'), frame.url);
    frameName = (document.querySelector('.oca-iframe') as HTMLIFrameElement).name;

    const event = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
    const time = document.getElementById('time')!;
    expect(time.getAttribute('role')).toBe('button');
    expect(time.getAttribute('tabindex')).toBe('0');
    time.dispatchEvent(event);
    await vi.waitFor(() => expect(video.currentTime).toBe(9));
    expect(event.defaultPrevented).toBe(true);
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    player.disposePlayer(document.querySelector('.markdown-preview-view'));
  });

  it('keeps one playing iframe mounted when its markdown section is replaced on scroll', async () => {
    const dom = new JSDOM('<div class="markdown-preview-view"><div id="first"></div></div>');
    const { document, MutationObserver } = dom.window;
    installObsidianDomHelpers(document);
    const { Companion, TFile } = loadCompanion(document, MutationObserver);
    const player = new Companion();
    player.app = { vault: { cachedRead: async () => '## 字幕\n\n[00:02](https://player.bilibili.com/player.html?bvid=BV123&p=2&t=2) 第一行' } };
    const preview = document.querySelector('.markdown-preview-view')!;
    const first = document.getElementById('first')!;
    const note = new TFile('clip.md');
    const source = 'https://player.bilibili.com/player.html?bvid=BV123&page=2&autoplay=0';

    await player.mountPlayer(first, note, source);
    const iframe = preview.querySelector('.oca-iframe')!;
    expect(iframe).not.toBeNull();
    first.remove();
    expect(iframe.isConnected).toBe(true);

    const second = document.createElement('div');
    preview.appendChild(second);
    await player.mountPlayer(second, note, source);
    expect(preview.querySelectorAll('.oca-iframe')).toHaveLength(1);
    expect(preview.querySelector('.oca-iframe')).toBe(iframe);
    expect(new URL(iframe.getAttribute('src')!).searchParams.get('bvid')).toBe('BV123');
    player.disposePlayer(preview);
  });

  it('restores the player after Obsidian replaces the entire note preview', async () => {
    const dom = new JSDOM('<div class="markdown-preview-view"><div id="first"></div></div>');
    const { document, MutationObserver } = dom.window;
    installObsidianDomHelpers(document);
    const { Companion, TFile } = loadCompanion(document, MutationObserver);
    const player = new Companion();
    player.app = { vault: { cachedRead: async () => '## 字幕\n\n`00:02` 第一行' } };
    const preview = document.querySelector('.markdown-preview-view')!;
    const note = new TFile('clip.md');
    const source = 'https://player.bilibili.com/player.html?bvid=BV123&page=1';

    await player.mountPlayer(document.getElementById('first')!, note, source);
    expect(preview.querySelectorAll('.oca-iframe')).toHaveLength(1);

    const replacement = document.createElement('div');
    preview.replaceChildren(replacement);
    await player.mountPlayer(replacement, note, source);

    expect(preview.querySelectorAll('.oca-iframe')).toHaveLength(1);
    expect(preview.querySelector('.oca-player-dock')).not.toBeNull();
    player.disposePlayer(preview);
  });

  it('waits for a rendered section to enter the reading view before mounting the player', async () => {
    const dom = new JSDOM('<body></body>');
    const { document, MutationObserver } = dom.window;
    installObsidianDomHelpers(document);
    const { Companion, TFile } = loadCompanion(document, MutationObserver);
    const player = new Companion();
    player.playerSessions = new Map();
    player.app = {
      vault: { cachedRead: async () => '## 字幕\n\n`00:02` 第一行' },
      workspace: { getLeavesOfType: () => [] },
    };
    const preview = document.createElement('div');
    preview.className = 'markdown-preview-view';
    const host = document.createElement('section');
    preview.appendChild(host);

    const mounting = player.mountPlayer(host, new TFile('clip.md'), 'https://player.bilibili.com/player.html?bvid=BV123');
    player.prunePlayers();
    document.body.appendChild(preview);
    await mounting;

    expect(preview.querySelectorAll('.oca-iframe')).toHaveLength(1);
    expect(preview.querySelectorAll('.oca-cue')).toHaveLength(1);
    player.disposePlayer(preview);
  });

  it('keeps a connected player during startup before markdown leaves are available', async () => {
    const dom = new JSDOM('<div class="markdown-preview-view"><div id="host"></div></div>');
    const { document, MutationObserver } = dom.window;
    installObsidianDomHelpers(document);
    const { Companion, TFile } = loadCompanion(document, MutationObserver);
    const player = new Companion();
    player.app = {
      vault: { cachedRead: async () => '## 字幕\n\n`00:02` 第一行' },
      workspace: { getLeavesOfType: () => [] },
    };
    const preview = document.querySelector('.markdown-preview-view')!;
    await player.mountPlayer(document.getElementById('host')!, new TFile('clip.md'), 'https://player.bilibili.com/player.html?bvid=BV123');

    player.prunePlayers();

    expect(preview.querySelectorAll('.oca-iframe')).toHaveLength(1);
    player.disposePlayer(preview);
  });

  it('sandboxes the embedded player so video clicks cannot open browser tabs', async () => {
    const dom = new JSDOM('<div class="markdown-preview-view"><div id="host"></div></div>');
    const { document, MutationObserver } = dom.window;
    installObsidianDomHelpers(document);
    const { Companion, TFile } = loadCompanion(document, MutationObserver);
    const player = new Companion();
    player.app = { vault: { cachedRead: async () => '## 字幕\n\n`00:02` 第一行' } };
    const source = 'https://player.bilibili.com/player.html?bvid=BV123&page=1&autoplay=0';
    await player.mountPlayer(document.getElementById('host')!, new TFile('clip.md'), source);

    const iframe = document.querySelector('.oca-player-dock iframe') as HTMLIFrameElement;
    const permissions = iframe.getAttribute('sandbox')?.split(/\s+/) || [];
    expect(permissions).toContain('allow-scripts');
    expect(permissions).toContain('allow-same-origin');
    expect(permissions).not.toContain('allow-popups');
    expect(permissions).not.toContain('allow-top-navigation');
    expect(iframe.getAttribute('allow')).toContain('fullscreen');
    expect(new URL(iframe.src).searchParams.get('bvid')).toBe('BV123');
    player.disposePlayer(document.querySelector('.markdown-preview-view'));
  });
});
