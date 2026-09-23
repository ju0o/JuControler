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

test('--project-id prints only the selected project', async () => {
  const { directory, path } = await fixture([]);
  await writeFile(path, JSON.stringify({ projects: [entry('a', join(directory, 'a')), entry('b', join(directory, 'b'))] }));
  const { code, stdout, stderr } = await run(path, '--project-id', 'b');
  assert.equal(code, 0, stderr);
  const board = JSON.parse(stdout);
  assert.deepEqual(board.map(({ projectId, status }) => ({ projectId, status })), [{ projectId: 'b', status: 'UNKNOWN' }]);
  assert.equal(board[0].source.id, 'repository-status/b');
  assert.equal(stdout, `${JSON.stringify(board, null, 2)}\n`);
});

test('fails nonzero with no stdout for unavailable or invalid registries', async (t) => {
  await t.test('unknown --project-id', async () => {
    const { path } = await fixture([entry('a', '/data/a')]);
    const { code, stdout, stderr } = await run(path, '--project-id', 'nope');
    assert.equal(code, 1);
    assert.equal(stdout, '');
    assert.match(stderr, /Unknown projectId: nope/);
  });
  await t.test('--project-id still rejects duplicate registries', async () => {
    const { path } = await fixture([entry('a', '/data/a'), entry('dup', '/data/dup'), entry('dup', '/data/dup')]);
    const { code, stdout, stderr } = await run(path, '--project-id', 'a');
    assert.equal(code, 1);
    assert.equal(stdout, '');
    assert.match(stderr, /is duplicated/);
  });
  for (const args of [['--project-id'], ['--project-id', ''], ['--bogus'], ['x.json', 'y.json']]) {
    await t.test(`bad arguments ${JSON.stringify(args)}`, async () => {
      const { path } = await fixture([]);
      const { code, stdout } = await run(...(args[0] === 'x.json' ? args : [path, ...args]));
      assert.equal(code, 2);
      assert.equal(stdout, '');
    });
  }

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
