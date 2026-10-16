import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, it } from 'vitest';

it('writes subtitle timestamps without an external player link', () => {
  const source = readFileSync(new URL('./content.js', import.meta.url), 'utf8');
  const formatter = source.slice(
    source.indexOf('function formatNoteTimestamp('),
    source.indexOf('function buildBilibiliEmbedIframe('),
  );
  const clock = source.slice(
    source.indexOf('function formatCompactTimestamp('),
    source.indexOf('function formatTimestamp('),
  );
  const result = vm.runInNewContext(
    `${clock}\n${formatter}\nformatNoteTimestamp(65, false)`,
  );
  expect(result).toBe('`01:05`');
});
