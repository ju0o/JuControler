import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('getting-started 상태판 안내 문장 table lines appear in scripts/status-board.mjs', async () => {
  const script = await read('scripts/status-board.mjs');
  const doc = await read('docs/getting-started.md');
  const section = doc.match(/^## 상태판 안내 문장 읽는 법[\s\S]*?(?=^## |(?![\s\S]))/m)?.[0];
  assert.ok(section, "getting-started '상태판 안내 문장 읽는 법' section not found");
  const lines = [...section.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]);
  assert.ok(lines.length > 0, 'no table lines found');

  for (const line of lines) {
    // ' (' too: the unknown-ID line appends its '(목록에 있는 ID: …)' suffix as a separate string.
    const pieces = line.split(/<[^>]*>|…| \(/).map((p) => p.trim()).filter((p) => p.length >= 4);
    assert.ok(pieces.length > 0, `no checkable piece in: ${line}`);
    for (const piece of pieces) {
      assert.ok(script.includes(piece), `not in status-board.mjs: "${piece}" (from: ${line})`);
    }
  }
});
