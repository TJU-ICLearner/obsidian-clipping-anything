import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function loadUriSaver() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const sendMessage = vi.fn((_message, callback) => callback({ success: true }));
  const sandbox = {
    navigator: { clipboard: { writeText } },
    chrome: { runtime: { sendMessage, lastError: null } },
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('./obsidian-uri.js', import.meta.url), 'utf8'), sandbox);
  const saver = (sandbox as typeof sandbox & {
    BiliObsidianUri: {
      buildUrl: (path: string, vault?: string) => string;
      save: (content: string, path: string, vault?: string) => Promise<void>;
    };
  }).BiliObsidianUri;
  return { saver, writeText, sendMessage };
}

describe('Bilibili Obsidian URI saving', () => {
  it('sends a long note through the clipboard and targets the selected vault', async () => {
    const { saver, writeText, sendMessage } = loadUriSaver();
    const content = '字幕'.repeat(10_000);

    await saver.save(content, 'Clippings/B站/示例.md', 'Example Vault');

    expect(writeText).toHaveBeenCalledWith(content);
    const request = sendMessage.mock.calls[0][0];
    expect(request.action).toBe('openObsidianUrl');
    expect(request.url).toContain('file=Clippings%2FB%E7%AB%99%2F%E7%A4%BA%E4%BE%8B.md');
    expect(request.url).toContain('vault=Example%20Vault');
    expect(request.url).toContain('&clipboard');
    expect(request.url).not.toContain(encodeURIComponent(content));
  });

  it('does not open Obsidian when copying fails', async () => {
    const { saver, writeText, sendMessage } = loadUriSaver();
    writeText.mockRejectedValueOnce(new Error('clipboard blocked'));

    await expect(saver.save('note', 'note.md')).rejects.toThrow('无法写入剪贴板');
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
