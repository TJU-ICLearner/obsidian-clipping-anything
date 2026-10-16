import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const { JSDOM } = require('jsdom');

describe('shared vault settings', () => {
  it('adds a Bilibili vault to the shared list and selects it for the main save button', async () => {
    const dom = new JSDOM('<select id="bili-settings-vault"></select><input id="bili-settings-new-vault"><button id="bili-settings-add-vault"></button><p id="bili-settings-vault-status"></p>');
    const sync: { vaults: string[] } = { vaults: ['Existing'] };
    const local: { anythingBilibiliVault: string } = { anythingBilibiliVault: '' };
    const chrome = {
      storage: {
        sync: { get: vi.fn(async () => ({ ...sync })), set: vi.fn(async (value: typeof sync) => Object.assign(sync, value)) },
        local: { get: vi.fn(async () => ({ ...local })), set: vi.fn(async (value: typeof local) => Object.assign(local, value)) },
        onChanged: { addListener: vi.fn() },
      },
    };
    vm.runInNewContext(readFileSync(new URL('../anything-settings.js', import.meta.url), 'utf8'), {
      document: dom.window.document,
      Option: dom.window.Option,
      chrome,
    });

    await vi.waitFor(() => expect(dom.window.document.querySelectorAll('option')).toHaveLength(2));
    const input = dom.window.document.getElementById('bili-settings-new-vault') as HTMLInputElement;
    input.value = 'My Obsidian Vault';
    (dom.window.document.getElementById('bili-settings-add-vault') as HTMLButtonElement).click();

    await vi.waitFor(() => expect(local.anythingBilibiliVault).toBe('My Obsidian Vault'));
    expect(sync.vaults).toEqual(['Existing', 'My Obsidian Vault']);
    expect((dom.window.document.getElementById('bili-settings-vault') as HTMLSelectElement).value).toBe('My Obsidian Vault');
  });
});
