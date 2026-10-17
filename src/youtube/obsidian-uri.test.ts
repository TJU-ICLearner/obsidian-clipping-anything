import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
function load(writeText: (text: string) => Promise<void>, sendMessage: any) {
  const scope: any = { navigator: { clipboard: { writeText } }, chrome: { runtime: { sendMessage, lastError: null } } };
  scope.globalThis = scope;
  vm.runInNewContext(readFileSync(new URL('./obsidian-uri.js', import.meta.url), 'utf8'), scope);
  return scope.OcaYouTubeUri;
}
describe('YouTube Obsidian URI saver', () => {
  it('copies the full note before launching a new note URI', async () => {
    const events: string[] = [];
    const uri = load(async text => { events.push(`copy:${text}`); }, (message: any, cb: any) => { events.push(message.url); cb({ success: true }); });
    await uri.save('full\nmarkdown', 'Clippings/YouTube/one.md', 'SOC Learning');
    expect(events[0]).toBe('copy:full\nmarkdown');
    expect(events[1]).toContain('obsidian://new?file=Clippings%2FYouTube%2Fone.md');
    expect(events[1]).toContain('&clipboard');
    expect(events[1]).not.toMatch(/append|overwrite/);
  });
  it('does not launch if clipboard write fails', async () => {
    const send = vi.fn();
    const uri = load(async () => { throw Error('denied'); }, send);
    await expect(uri.save('note', 'one.md', '')).rejects.toThrow(/剪贴板/);
    expect(send).not.toHaveBeenCalled();
  });
});
