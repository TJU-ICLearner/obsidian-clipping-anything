import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
const { JSDOM } = require('jsdom');
const ID = 'M7lc1UVf-VE';
const EMBED_URL = `https://www.youtube.com/embed/${ID}?enablejsapi=1`;
function helpers(document: Document) {
  const proto = document.defaultView!.HTMLElement.prototype as any;
  proto.createEl = function(tag: string, options: any = {}) { const node = document.createElement(tag); if (options.cls) node.className = options.cls; if (options.text) node.textContent = options.text; this.appendChild(node); return node; };
  proto.createDiv = function(options: any = {}) { return this.createEl('div', options); };
  proto.createSpan = function(options: any = {}) { return this.createEl('span', options); };
  proto.addClass = function(name: string) { this.classList.add(name); };
  proto.removeClass = function(name: string) { this.classList.remove(name); };
}
function setup(markdown: string, embed = EMBED_URL) {
  const dom = new JSDOM(`<div class="markdown-preview-view"><div id="block"><iframe src="${embed}"></iframe></div><p><code id="time">01:05</code> line</p></div>`);
  const { document, MutationObserver } = dom.window; helpers(document);
  const instances: any[] = [];
  const requestedModules: string[] = [];
  let postprocessor: any;
  class Plugin { app: any; register() {} registerEvent() {} registerMarkdownPostProcessor(cb: any) { postprocessor = cb; } }
  class TFile { path: string; extension = 'md'; constructor(path: string) { this.path = path; } }
  const sandbox: any = { module: { exports: {} }, URL: globalThis.URL, Buffer, document, MutationObserver, setTimeout, clearTimeout, setInterval, clearInterval,
    require: (id: string) => { requestedModules.push(id); return id === 'obsidian' ? { Plugin, Notice: class {}, TFile } : id === '/vault/.obsidian/plugins/obsidian-clipper-anything-player/youtube-player.js' ? { createYouTubeController: (iframe: any, videoId: string, callbacks: any) => { const controller = { iframe, videoId, callbacks, seek: vi.fn(async () => {}), destroy: vi.fn() }; instances.push(controller); return controller; } } : require(id); }, };
  vm.runInNewContext(readFileSync(new URL('../../obsidian-clipper-anything-player/main.js', import.meta.url), 'utf8'), sandbox);
  const Companion = sandbox.module.exports as any;
  const plugin = new Companion();
  plugin.manifest = { id: 'obsidian-clipper-anything-player' };
  plugin.app = { vault: { adapter: { getBasePath: () => '/vault' }, configDir: '.obsidian', getAbstractFileByPath: () => new TFile('clip.md'), cachedRead: async () => markdown }, workspace: { on: () => ({}), getLeavesOfType: () => [] } };
  return { dom, document, instances, requestedModules, plugin, getPostprocessor: () => postprocessor };
}
const note = `---\nclip_platform: youtube\nyoutube_id: "${ID}"\n---\n\n## 字幕\n\n\`01:05\` First\n\`01:08\` Second`;
describe('YouTube reading view integration', () => {
  it('dispatches a matching note to one local iframe and one controller; timestamp seeks and progress highlights', async () => {
    const s = setup(note);
    await s.plugin.onload();
    s.getPostprocessor()(s.document.getElementById('block'), { sourcePath: 'clip.md' });
    await vi.waitFor(() => expect(s.instances).toHaveLength(1));
    const preview = s.document.querySelector('.markdown-preview-view')!;
    expect(preview.querySelectorAll('iframe')).toHaveLength(1);
    expect(s.instances[0].videoId).toBe(ID);
    expect(s.requestedModules).toContain('/vault/.obsidian/plugins/obsidian-clipper-anything-player/youtube-player.js');
    const time = s.document.getElementById('time')!;
    const click = new s.dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
    time.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(s.instances[0].seek).toHaveBeenCalledWith(65));
    s.instances[0].callbacks.onTime(68.5);
    expect(preview.querySelectorAll('.oca-cue')[1].classList.contains('is-active')).toBe(true);
    s.document.getElementById('block')!.remove();
    const next = s.document.createElement('div'); next.innerHTML = `<iframe src="${EMBED_URL}"></iframe>`; preview.appendChild(next);
    s.getPostprocessor()(next, { sourcePath: 'clip.md' });
    await vi.waitFor(() => expect(preview.querySelectorAll('iframe')).toHaveLength(1));
    expect(s.instances).toHaveLength(1);
    s.plugin.app.workspace.getLeavesOfType = () => [{ containerEl: s.document.body, view: { file: { path: 'different-note.md' } } }];
    s.plugin.prunePlayers();
    expect(s.instances[0].destroy).toHaveBeenCalledTimes(1);
  });
  it('ignores an embed whose ID conflicts with note frontmatter', async () => {
    const s = setup(note, 'https://www.youtube.com/embed/abcdefghijk?enablejsapi=1');
    await s.plugin.onload();
    s.getPostprocessor()(s.document.getElementById('block'), { sourcePath: 'clip.md' });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(s.instances).toHaveLength(0);
  });
  it('surfaces player readiness failure without claiming a successful seek', async () => {
    const s = setup(note);
    await s.plugin.onload(); s.getPostprocessor()(s.document.getElementById('block'), { sourcePath: 'clip.md' });
    await vi.waitFor(() => expect(s.instances).toHaveLength(1));
    s.instances[0].callbacks.onError(new Error('此视频不允许嵌入播放。'));
    expect(s.document.querySelector('.oca-player-hint')!.textContent).toContain('不允许嵌入');
    s.plugin.disposePlayer(s.document.querySelector('.markdown-preview-view'));
  });
  it('shows a video without seek controls or highlighting for an untimed transcript', async () => {
    const markdown = `---\nclip_platform: youtube\nyoutube_id: "${ID}"\n---\n\n## 字幕\n\n由视频简介整理，未经音频校对，无时间轴。\n\n第一句。\n第二句。`;
    const s = setup(markdown);
    await s.plugin.onload();
    s.getPostprocessor()(s.document.getElementById('block'), { sourcePath: 'clip.md' });
    await vi.waitFor(() => expect(s.instances).toHaveLength(1));
    const preview = s.document.querySelector('.markdown-preview-view')!;
    expect(preview.querySelectorAll('.oca-cue')).toHaveLength(0);
    expect(preview.querySelector('.oca-player-hint')?.textContent).toContain('无时间轴');
    s.instances[0].callbacks.onReady();
    expect(preview.querySelector('.oca-player-hint')?.textContent).toContain('不支持按字幕跳转或高亮');
    const time = s.document.getElementById('time')!;
    const click = new s.dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
    time.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    expect(s.instances[0].seek).not.toHaveBeenCalled();
    expect(time.classList.contains('oca-note-timestamp')).toBe(false);
  });
  it('scrubs an untimed note video with a separate accessible range control', async () => {
    const markdown = `---\nclip_platform: youtube\nyoutube_id: "${ID}"\n---\n\n## 字幕\n\n由视频简介整理，未经音频校对，无时间轴。`;
    const s = setup(markdown);
    await s.plugin.onload();
    s.getPostprocessor()(s.document.getElementById('block'), { sourcePath: 'clip.md' });
    await vi.waitFor(() => expect(s.instances).toHaveLength(1));
    const slider = s.document.querySelector('.oca-youtube-seek') as HTMLInputElement;
    expect(slider).not.toBeNull();
    expect(slider.getAttribute('aria-label')).toContain('进度');
    expect(slider.disabled).toBe(true);
    s.instances[0].callbacks.onProgress({ seconds: 10, duration: 52 });
    expect(slider.disabled).toBe(false);
    expect(slider.max).toBe('52');
    expect(slider.value).toBe('10');
    slider.value = '30';
    slider.dispatchEvent(new s.dom.window.Event('input', { bubbles: true }));
    s.instances[0].callbacks.onProgress({ seconds: 11, duration: 52 });
    expect(slider.value).toBe('30');
    slider.dispatchEvent(new s.dom.window.Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(s.instances[0].seek).toHaveBeenCalledWith(30));
    expect(s.document.querySelector('.oca-youtube-time')?.textContent).toContain('00:30 / 00:52');
  });
});
