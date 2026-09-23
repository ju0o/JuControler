import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import assert from 'node:assert/strict';

const cli = new URL('../scripts/status-board.mjs', import.meta.url).pathname;

const run = (...args) => promisify(execFile)(process.execPath, [cli, ...args])
  .then(({ stdout, stderr }) => ({ code: 0, stdout, stderr }))
  .catch(({ code, stdout, stderr }) => ({ code, stdout, stderr }));

async function fixture(projects) {
  const directory = await mkdtemp(join(tmpdir(), 'jucontroler-cli-'));
  const path = join(directory, 'registry.json');
  await writeFile(path, JSON.stringify({ projects }));
  return { directory, path };
}

const entry = (projectId, dataRoot) => ({
  projectId,
  workspaceRoot: `/work/${projectId}`,
  dataRoot,
  sourceRef: `repository-status/${projectId}`,
});

test('prints the canonical board projection without writing', async () => {
  const { directory, path } = await fixture([]);
  const readyRoot = join(directory, 'ready');
  await mkdir(readyRoot);
  const observedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const current = {
    schema: 'project-status.v1',
    projectId: 'ready',
    status: 'READY',
    observedAt,
    source: { kind: 'repository-status-file', id: 'ready/status' },
  };
  await writeFile(join(readyRoot, 'current.json'), JSON.stringify(current));
  await writeFile(path, JSON.stringify({ projects: [entry('ready', readyRoot), entry('missing', join(directory, 'none'))] }));
  const before = await readdir(directory, { recursive: true });
  const registryBefore = await readFile(path, 'utf8');

  const { code, stdout, stderr } = await run(path);
  assert.equal(code, 0, stderr);
  const board = JSON.parse(stdout);
  assert.deepEqual(board.map(({ projectId, status, stale }) => ({ projectId, status, stale })), [
    { projectId: 'ready', status: 'READY', stale: false },
    { projectId: 'missing', status: 'UNKNOWN', stale: true },
  ]);
  assert.equal(board[0].observedAt, observedAt);
  assert.equal(board[1].reason, 'unavailable');
  assert.deepEqual(await readdir(directory, { recursive: true }), before);
  assert.equal(await readFile(path, 'utf8'), registryBefore);
});

test('fails nonzero with no stdout for unavailable or invalid registries', async (t) => {
  await t.test('missing argument', async () => {
    const { code, stdout } = await run();
    assert.notEqual(code, 0);
    assert.equal(stdout, '');
  });
  await t.test('missing registry file', async () => {
    const { code, stdout, stderr } = await run(join(tmpdir(), 'jucontroler-no-such-registry.json'));
    assert.equal(code, 1);
    assert.equal(stdout, '');
    assert.match(stderr, /Unable to read project registry/);
  });
  await t.test('invalid entry', async () => {
    const { path } = await fixture([entry('bad', 'relative/data')]);
    const { code, stdout, stderr } = await run(path);
    assert.equal(code, 1);
    assert.equal(stdout, '');
    assert.match(stderr, /dataRoot must be absolute/);
  });
  await t.test('duplicate project IDs', async () => {
    const { path } = await fixture([entry('dup', '/data/dup'), entry('dup', '/data/dup')]);
    const { code, stdout, stderr } = await run(path);
    assert.equal(code, 1);
    assert.equal(stdout, '');
    assert.match(stderr, /is duplicated/);
  });
});
