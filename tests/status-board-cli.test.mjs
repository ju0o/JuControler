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

test('prints a saved JuPlan status source in registry order without writing', async () => {
  const { directory, path } = await fixture([]);
  const planRoot = join(directory, 'plan');
  await mkdir(planRoot);
  const observedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  await writeFile(join(planRoot, 'current.json'), JSON.stringify({ projectId: 'plan', status: 'PLANNING', observedAt }));
  await writeFile(path, JSON.stringify({ projects: [
    { ...entry('missing', join(directory, 'none')), sourceKind: 'juplan-status' },
    { ...entry('plan', planRoot), sourceKind: 'juplan-status' },
  ] }));
  const before = await readdir(directory, { recursive: true });

  const { code, stdout, stderr } = await run(path);
  assert.equal(code, 0, stderr);
  assert.deepEqual(JSON.parse(stdout).map((row) => [row.projectId, row.status, row.stale, row.reason, row.source]), [
    ['missing', 'UNKNOWN', true, 'unavailable', { kind: 'juplan-status', id: 'juplan/missing' }],
    ['plan', 'PLANNING', false, undefined, { kind: 'juplan-status', id: 'juplan/plan' }],
  ]);
  assert.deepEqual(await readdir(directory, { recursive: true }), before);
});

test('prints a saved JuCeipt receipt source in registry order without writing', async () => {
  const { directory, path } = await fixture([]);
  const receiptRoot = join(directory, 'receipt');
  await mkdir(receiptRoot);
  const generatedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  await writeFile(join(receiptRoot, 'current.json'), JSON.stringify({
    receipt_id: 'rcpt-1', acceptance: { state: 'ACCEPTED' }, generated_at: generatedAt,
  }));
  await writeFile(path, JSON.stringify({ projects: [
    { ...entry('missing', join(directory, 'none')), sourceKind: 'juceipt-receipt' },
    { ...entry('receipt', receiptRoot), sourceKind: 'juceipt-receipt' },
  ] }));
  const before = await readdir(directory, { recursive: true });

  const { code, stdout, stderr } = await run(path);
  assert.equal(code, 0, stderr);
  assert.deepEqual(JSON.parse(stdout).map((row) => [row.projectId, row.status, row.stale, row.reason, row.sourceRevision, row.source]), [
    ['missing', 'UNKNOWN', true, 'unavailable', undefined, { kind: 'juceipt-receipt', id: 'juceipt/missing' }],
    ['receipt', 'ACCEPTED', false, undefined, 'rcpt-1', { kind: 'juceipt-receipt', id: 'juceipt/receipt' }],
  ]);
  assert.deepEqual(await readdir(directory, { recursive: true }), before);
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
    assert.match(stderr.split('\n')[0], /그런 프로젝트 ID가 목록에 없어요 — --project-id 값을 확인하세요/);
  });
  await t.test('--project-id still rejects duplicate registries', async () => {
    const { path } = await fixture([entry('a', '/data/a'), entry('dup', '/data/dup'), entry('dup', '/data/dup')]);
    const { code, stdout, stderr } = await run(path, '--project-id', 'a');
    assert.equal(code, 1);
    assert.equal(stdout, '');
    assert.match(stderr, /is duplicated/);
    assert.match(stderr.split('\n')[0], /프로젝트 목록 파일 내용이 올바르지 않아요/);
  });
  for (const args of [['--project-id'], ['--project-id', ''], ['--bogus'], ['x.json', 'y.json']]) {
    await t.test(`bad arguments ${JSON.stringify(args)}`, async () => {
      const { path } = await fixture([]);
      const { code, stdout, stderr } = await run(...(args[0] === 'x.json' ? args : [path, ...args]));
      assert.equal(code, 2);
      assert.equal(stdout, '');
      assert.match(stderr.split('\n')[0], /^사용법: /);
    });
  }

  await t.test('missing argument', async () => {
    const { code, stdout, stderr } = await run();
    assert.notEqual(code, 0);
    assert.equal(stdout, '');
    assert.match(stderr.split('\n')[0], /^사용법: /);
  });
  await t.test('missing registry file', async () => {
    const { code, stdout, stderr } = await run(join(tmpdir(), 'jucontroler-no-such-registry.json'));
    assert.equal(code, 1);
    assert.equal(stdout, '');
    assert.match(stderr, /Unable to read project registry/);
    assert.match(stderr.split('\n')[0], /프로젝트 목록 파일을 열 수 없어요 — 경로를 확인하세요/);
  });
  await t.test('invalid entry', async () => {
    const { path } = await fixture([entry('bad', 'relative/data')]);
    const { code, stdout, stderr } = await run(path);
    assert.equal(code, 1);
    assert.equal(stdout, '');
    assert.match(stderr, /dataRoot must be absolute/);
    assert.match(stderr.split('\n')[0], /프로젝트 목록 파일 내용이 올바르지 않아요/);
  });
  await t.test('duplicate project IDs', async () => {
    const { path } = await fixture([entry('dup', '/data/dup'), entry('dup', '/data/dup')]);
    const { code, stdout, stderr } = await run(path);
    assert.equal(code, 1);
    assert.equal(stdout, '');
    assert.match(stderr, /is duplicated/);
    assert.match(stderr.split('\n')[0], /프로젝트 목록 파일 내용이 올바르지 않아요/);
  });
});

test('prints a saved Agent Relay board source by runner and lane without writing', async () => {
  const { directory, path } = await fixture([]);
  const relayRoot = join(directory, 'relay');
  await mkdir(relayRoot);
  const observedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  await writeFile(join(relayRoot, 'current.json'), JSON.stringify({
    kind: 'BOARD', observedAt, runner: { day: 'IDLE', night: 'RUNNING' }, lanes: [{ id: 'lane', state: 'RUNNING' }],
  }));
  await writeFile(path, JSON.stringify({ projects: [
    { ...entry('agent-relay', relayRoot), sourceKind: 'agent-relay-board' },
    { ...entry('lane', relayRoot), sourceKind: 'agent-relay-board' },
    { ...entry('missing', join(directory, 'none')), sourceKind: 'agent-relay-board' },
  ] }));
  const before = await readdir(directory, { recursive: true });

  const { code, stdout, stderr } = await run(path);
  assert.equal(code, 0, stderr);
  assert.deepEqual(JSON.parse(stdout).map((row) => [row.projectId, row.status, row.stale, row.reason, row.source]), [
    ['agent-relay', 'day=IDLE;night=RUNNING', false, undefined, { kind: 'agent-relay-board', id: 'agent-relay/runner' }],
    ['lane', 'RUNNING', false, undefined, { kind: 'agent-relay-board', id: 'agent-relay/lanes/lane' }],
    ['missing', 'UNKNOWN', true, 'unavailable', { kind: 'agent-relay-board', id: 'agent-relay/lanes/missing' }],
  ]);
  assert.deepEqual(await readdir(directory, { recursive: true }), before);
});

test('offline e2e script prints exactly one passing JSON result line and cleans up', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'jucontroler-e2e-parent-'));
  const script = new URL('../scripts/e2e.sh', import.meta.url).pathname;
  const { stdout } = await promisify(execFile)('bash', [script], { env: { ...process.env, TMPDIR: parent } });
  const lines = stdout.trim().split('\n');
  assert.equal(lines.length, 1);
  const result = JSON.parse(lines[0]);
  assert.equal(result.schema, 'jucontroler.e2e.v1');
  assert.equal(result.ok, true);
  assert.equal(result.projects, 6);
  assert.equal(result.statuses['agent-relay'], 'day=IDLE;night=RUNNING');
  assert.deepEqual(await readdir(parent), []);
});
