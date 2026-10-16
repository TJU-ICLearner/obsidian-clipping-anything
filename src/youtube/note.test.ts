import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
function load() {
  const scope: any = { URL, crypto: { getRandomValues: (array: Uint8Array) => array.fill(7) } };
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
  it('rejects unsafe folder and missing secure randomness', () => {
    const model = load();
    expect(() => model.build(snapshot, { folder: '../elsewhere', randomBytes: () => new Uint8Array([1]) })).toThrow();
    expect(() => model.build(snapshot, { folder: 'Clippings', randomBytes: () => { throw Error('no entropy'); } })).toThrow();
  });
});
