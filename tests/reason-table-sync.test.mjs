import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('status-board reasonWords keys match the README 처음 쓰는 법 reason table', async () => {
  const script = await read('scripts/status-board.mjs');
  const block = script.match(/const reasonWords = \{\n([\s\S]*?)\n\};/)?.[1];
  assert.ok(block, 'reasonWords object not found in scripts/status-board.mjs');
  const words = [...block.matchAll(/^\s*'?([\w-]+)'?:/gm)].map((m) => m[1]);

  const readme = await read('README.md');
  const section = readme.match(/^## 3\. .*처음 쓰는 법[\s\S]*?(?=^## )/m)?.[0];
  assert.ok(section, "README '처음 쓰는 법' section not found");
  const rows = section.split(/^\| --- \| --- \| --- \|$/m)[1];
  assert.ok(rows, "README '처음 쓰는 법' reason table not found");
  const table = [...rows.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]);

  assert.ok(words.length > 0);
  assert.equal(new Set(words).size, words.length, 'duplicate reasonWords key');
  assert.equal(new Set(table).size, table.length, 'duplicate README reason row');
  assert.deepEqual([...table].sort(), [...words].sort());
});
