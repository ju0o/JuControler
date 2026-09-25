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
  assert.equal(stdout, `${JSON.stringify(board, null, 2)}\n`);
  assert.equal(stderr, '프로젝트 2개 중 1개는 상태를 알 수 없어요: missing(unavailable: 상태 파일이 없거나 읽을 수 없어요) — README 처음 쓰는 법의 reason 표를 보세요\n');
  assert.deepEqual(await readdir(directory, { recursive: true }), before);
  assert.equal(await readFile(path, 'utf8'), registryBefore);

  await writeFile(path, JSON.stringify({ projects: [entry('ready', readyRoot)] }));
  const allRead = await run(path);
  assert.equal(allRead.code, 0, allRead.stderr);
  assert.equal(allRead.stdout, `${JSON.stringify(JSON.parse(allRead.stdout), null, 2)}\n`);
  assert.equal(allRead.stderr, '프로젝트 1개 모두 상태를 읽었어요\n');
});

test('empty registry prints [] and tells the user to add projects', async () => {
  const { path } = await fixture([]);
  const { code, stdout, stderr } = await run(path);
  assert.equal(code, 0, stderr);
  assert.equal(stdout, '[]\n');
  assert.equal(stderr, '목록에 프로젝트가 없어요 — registry.json의 projects에 항목을 넣으세요 (README 처음 쓰는 법 예시 참고)\n');
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
    const { path } = await fixture([entry('a', '/data/a'), entry('b', '/data/b')]);
    const { code, stdout, stderr } = await run(path, '--project-id', 'nope');
    assert.equal(code, 1);
    assert.equal(stdout, '');
    assert.match(stderr, /Unknown projectId: nope/);
    assert.equal(stderr.split('\n')[0], '그런 프로젝트 ID가 목록에 없어요 — --project-id 값을 확인하세요 (목록에 있는 ID: a, b)');
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

  for (const args of [['--help'], ['-h'], [join(tmpdir(), 'jucontroler-no-such-registry.json'), '--help']]) {
    await t.test(`help ${JSON.stringify(args)}`, async () => {
      const { code, stdout, stderr } = await run(...args);
      assert.equal(code, 0);
      assert.equal(stderr, '');
      assert.equal(stdout, '사용법: node scripts/status-board.mjs <프로젝트 목록 파일.json> [--project-id <프로젝트 ID>]\nUsage: status-board.mjs <registry.json> [--project-id <id>]\n');
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
  await t.test('broken JSON registry', async () => {
    const { path } = await fixture([]);
    await writeFile(path, '{"projects": [,]');
    const { code, stdout, stderr } = await run(path);
    assert.equal(code, 1);
    assert.equal(stdout, '');
    assert.equal(stderr.split('\n')[0], '프로젝트 목록 파일이 올바른 JSON이 아니에요 — 쉼표·따옴표·괄호를 확인하세요');
    assert.match(stderr.split('\n')[1], /^Unable to read project registry: /);
  });
  await t.test('invalid entry', async () => {
    const { path } = await fixture([entry('bad', 'relative/data')]);
    const { code, stdout, stderr } = await run(path);
    assert.equal(code, 1);
    assert.equal(stdout, '');
    assert.match(stderr, /dataRoot must be absolute/);
    assert.equal(stderr.split('\n')[0], '프로젝트 목록 파일 내용이 올바르지 않아요 — 1번째 항목의 dataRoot는 /로 시작하는 절대 경로여야 해요');
    assert.equal(stderr.split('\n')[1], 'Invalid project registry: projects[0].dataRoot must be absolute');
  });
  await t.test('duplicate project IDs', async () => {
    const { path } = await fixture([entry('dup', '/data/dup'), entry('dup', '/data/dup')]);
    const { code, stdout, stderr } = await run(path);
    assert.equal(code, 1);
    assert.equal(stdout, '');
    assert.match(stderr, /is duplicated/);
    assert.equal(stderr.split('\n')[0], '프로젝트 목록 파일 내용이 올바르지 않아요 — 프로젝트 ID dup가 두 번 이상 나와요 — 하나만 남기거나 ID를 바꾸세요');
    assert.equal(stderr.split('\n')[1], 'Invalid project registry: projectId dup is duplicated');
  });
  await t.test('unknown entry field', async () => {
    const { path } = await fixture([entry('a', '/data/a'), { ...entry('b', '/data/b'), colour: 'red' }]);
    const { code, stdout, stderr } = await run(path);
    assert.equal(code, 1);
    assert.equal(stdout, '');
    assert.equal(stderr.split('\n')[0], '프로젝트 목록 파일 내용이 올바르지 않아요 — 2번째 항목의 colour는 쓸 수 없는 이름이에요 — 지우거나 철자를 확인하세요');
    assert.equal(stderr.split('\n')[1], 'Invalid project registry: projects[1].colour is not a known field');
  });
  await t.test('bad sourceKind', async () => {
    const { path } = await fixture([{ ...entry('a', '/data/a'), sourceKind: 'nope' }]);
    const { code, stdout, stderr } = await run(path);
    assert.equal(code, 1);
    assert.equal(stdout, '');
    assert.equal(stderr.split('\n')[0], '프로젝트 목록 파일 내용이 올바르지 않아요 — 1번째 항목의 sourceKind는 repository-status-file, juplan-status, juceipt-receipt, agent-relay-board 중 하나여야 해요');
    assert.match(stderr.split('\n')[1], /^Invalid project registry: projects\[0\]\.sourceKind must be one of /);
  });
  for (const [name, registry, hint] of [
    ['missing field', { projects: [{ ...entry('a', '/data/a'), sourceRef: undefined }] }, '1번째 항목에 sourceRef가 없거나 비어 있어요 — 값을 채우세요'],
    ['empty field', { projects: [{ ...entry('a', '/data/a'), projectId: ' ' }] }, '1번째 항목에 projectId가 없거나 비어 있어요 — 값을 채우세요'],
    ['relative workspaceRoot', { projects: [{ ...entry('a', '/data/a'), workspaceRoot: 'work' }] }, '1번째 항목의 workspaceRoot는 /로 시작하는 절대 경로여야 해요'],
    ['negative freshnessMs', { projects: [{ ...entry('a', '/data/a'), freshnessMs: -1 }] }, '1번째 항목의 freshnessMs는 0 이상의 숫자여야 해요'],
    ['projects not an array', { projects: {} }, 'projects는 [ ]로 감싼 목록이어야 해요'],
    ['entry not an object', { projects: [entry('a', '/data/a'), 'b'] }, '2번째 항목이 { }로 감싼 객체가 아니에요'],
    ['unknown top-level field', { projects: [], extra: 1 }, '맨 위에는 projects만 둘 수 있어요 — extra를 지우세요'],
  ]) {
    await t.test(`invalid registry hint: ${name}`, async () => {
      const { path } = await fixture([]);
      await writeFile(path, JSON.stringify(registry));
      const { code, stdout, stderr } = await run(path);
      assert.equal(code, 1);
      assert.equal(stdout, '');
      assert.equal(stderr.split('\n')[0], `프로젝트 목록 파일 내용이 올바르지 않아요 — ${hint}`);
      assert.match(stderr.split('\n')[1], /^Invalid project registry: /);
    });
  }
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

test('names held and human-gate lanes on one extra stderr line', async () => {
  const { directory, path } = await fixture([]);
  const relayRoot = join(directory, 'relay');
  await mkdir(relayRoot);
  const observedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  await writeFile(join(relayRoot, 'current.json'), JSON.stringify({
    kind: 'BOARD', observedAt, runner: { day: 'IDLE', night: 'RUNNING' }, lanes: [
      { id: 'held', state: 'RUNNING', holds: ['waiting'] },
      { id: 'gated', state: 'BLOCKED', humanGate: { reason: 'review' } },
    ],
  }));
  await writeFile(path, JSON.stringify({ projects: [
    { ...entry('held', relayRoot), sourceKind: 'agent-relay-board' },
    { ...entry('gated', relayRoot), sourceKind: 'agent-relay-board' },
  ] }));

  const { code, stdout, stderr } = await run(path);
  assert.equal(code, 0, stderr);
  assert.deepEqual(JSON.parse(stdout).map((row) => [row.projectId, row.status, row.reason]), [
    ['held', 'RUNNING', 'hold'],
    ['gated', 'BLOCKED', 'human-gate'],
  ]);
  assert.equal(stderr, '프로젝트 2개 모두 상태를 읽었어요\n'
    + '확인이 필요한 프로젝트: held(hold: 레인이 보류 중이에요), gated(human-gate: 사람 확인을 기다려요) — 해당 레인의 확인 요청이나 보류를 처리하세요\n');
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
  assert.equal(result.message, '모두 정상이에요');
  assert.equal(result.projects, 6);
  assert.equal(result.statuses['agent-relay'], 'day=IDLE;night=RUNNING');
  assert.deepEqual(await readdir(parent), []);
});
