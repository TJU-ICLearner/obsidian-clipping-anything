import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
function load() {
  const scope: any = { URL, TextEncoder, crypto: { getRandomValues: (array: Uint8Array) => array.fill(7) } };
  scope.globalThis = scope;
  vm.runInNewContext(readFileSync(new URL('./note.js', import.meta.url), 'utf8'), scope);
  return scope.OcaYouTubeNote;
}
const snapshot = { videoId: 'M7lc1UVf-VE', title: 'A /../ : [hostile](https://evil.test)\n# title', channel: 'Channel', url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE', description: 'description\n## Injected', chapters: [], cues: [{ start: 65, text: 'Hello [link](https://evil.test)' }] };
describe('YouTube note model', () => {
  it('emits safe frontmatter, note-local embed, and code timestamps without external links', () => {
    const note = load().build(snapshot, { folder: 'Clippings/YouTube', now: new Date('2026-10-17T00:00:00Z'), randomBytes: () => new Uint8Array([1, 2, 3, 4]) });
    expect(note.markdown).toContain('clip_platform: youtube');
    expect(note.markdown).toContain('youtube_id: "M7lc1UVf-VE"');
    expect(note.markdown).toContain('https://www.youtube.com/embed/M7lc1UVf-VE?enablejsapi=1');
    expect(note.markdown).toContain('`01:05` Hello');
    expect(note.markdown.split('---').slice(2).join('---')).not.toContain('](https://evil.test)');
    expect(note.filepath).toMatch(/^Clippings\/YouTube\/.+M7lc1UVf-VE.+\.md$/);
    expect(note.filepath).not.toContain('..');
    const short = load().build({ ...snapshot, videoId: '_i92TmBGF8k', url: 'https://www.youtube.com/shorts/_i92TmBGF8k', cues: [] }, { folder: 'Clippings/YouTube', now: new Date('2026-10-17T00:00:00Z'), randomBytes: () => new Uint8Array([1, 2, 3, 4]) });
    expect(short.markdown).toContain('source: \"https://www.youtube.com/shorts/_i92TmBGF8k\"');
    expect(short.markdown).toContain('https://www.youtube.com/embed/_i92TmBGF8k?enablejsapi=1');
  });
  it('makes repeated clips unique and emits an honest metadata-only subtitle section', () => {
    const model = load();
    let value = 1;
    const options = () => ({ folder: 'Clippings/YouTube', now: new Date('2026-10-17T00:00:00Z'), randomBytes: () => new Uint8Array([value++, 2, 3, 4]) });
    const first = model.build({ ...snapshot, cues: [] }, options());
    const second = model.build({ ...snapshot, cues: [] }, options());
    expect(first.filepath).not.toBe(second.filepath);
    expect(first.markdown).toContain('## 字幕');
    expect(first.markdown).toContain('未从页面读取到文字记录');
    expect(first.markdown).not.toMatch(/`\d\d:\d\d`/);
  });
  it('turns speech-like description into clean untimed sentences without seek markers', () => {
    const description = '认识示例处理器（演示）？（甲、乙、丙模块）\n处理器。它由几个功能模块组成，每个模块都承担不同的任务。第一个模块处理输入信息，第二个模块保存中间结果。第三个模块负责把结果传给其他设备。把这些部件放在一起，可以缩短它们之间的数据传输路径。#shorts\n#示例 #科技\n…更多 2.03万位订阅者 视频详细信息';
    const note = load().build({ ...snapshot, title: '认识示例处理器？（甲、乙、丙模块）', description, cues: [] }, { folder: 'Clippings/YouTube' });
    expect(note.markdown).toContain('由视频简介整理，未经音频校对，无时间轴');
    expect(note.markdown).toContain('## 简介摘录');
    expect(note.markdown).not.toContain('## 字幕');
    expect(note.markdown).toContain('第一个模块处理输入信息，第二个模块保存中间结果。\n');
    expect(note.markdown).not.toContain('认识示例处理器（演示）？');
    expect(note.markdown).not.toMatch(/订阅者|视频详细信息|…更多|#shorts|#示例/);
    expect(note.markdown).not.toMatch(/`\d\d:\d\d`/);
  });
  it('does not present promotional or link-only descriptions as speech', () => {
    const description = '加入会员：https://example.com\n订阅频道，领取资料包。#shorts';
    const note = load().build({ ...snapshot, description, cues: [] }, { folder: 'Clippings/YouTube' });
    expect(note.markdown).toContain('## 简介');
    expect(note.markdown).toContain('未从页面读取到文字记录');
    expect(note.markdown).not.toContain('由视频简介整理');
  });
  it('keeps speech paragraphs when a separate promotion follows them', () => {
    const description = '芯片包含不同的计算单元。处理器负责通用计算任务。图形单元负责画面处理。集成这些单元可以节省空间。它们共享内存并互相配合。\n加入会员：https://example.com';
    const note = load().build({ ...snapshot, description, cues: [] }, { folder: 'Clippings/YouTube' });
    expect(note.markdown).toContain('由视频简介整理，未经音频校对，无时间轴');
    expect(note.markdown).toContain('处理器负责通用计算任务。\n');
    expect(note.markdown).not.toContain('加入会员');
  });
  it('drops a flattened heading from rendered description before the spoken text', () => {
    const description = '认识示例处理器（演示）？（甲、乙、丙模块） 处理器。它由几个功能模块组成，每个模块都承担不同的任务。第一个模块处理输入信息，第二个模块保存中间结果。第三个模块负责把结果传给其他设备。把这些部件放在一起，可以缩短它们之间的数据传输路径。…更多 2.03万位订阅者';
    const note = load().build({ ...snapshot, title: '认识示例处理器？（甲、乙、丙模块）', description, cues: [] }, { folder: 'Clippings/YouTube' });
    expect(note.markdown).toContain('由视频简介整理，未经音频校对，无时间轴');
    expect(note.markdown).not.toContain('认识示例处理器（演示）？');
    expect(note.markdown).not.toContain('订阅者');
  });
  it('rejects unsafe folder and missing secure randomness', () => {
    const model = load();
    expect(() => model.build(snapshot, { folder: '../elsewhere', randomBytes: () => new Uint8Array([1]) })).toThrow();
    expect(() => model.build(snapshot, { folder: 'Clippings', randomBytes: () => { throw Error('no entropy'); } })).toThrow();
  });
  it('keeps multilingual filenames within a filesystem component limit and removes controls', () => {
    const title = `\u0000${'中文标题'.repeat(30)}\u0085`;
    const note = load().build({ ...snapshot, title }, { folder: 'Clippings/YouTube', now: new Date('2026-10-17T00:00:00Z'), randomBytes: () => new Uint8Array(8) });
    const name = note.filepath.split('/').at(-1)!;
    expect(Buffer.byteLength(name, 'utf8')).toBeLessThanOrEqual(255);
    expect(name).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    expect(note.markdown).not.toMatch(/[\u0000\u0085]/);
  });
});
