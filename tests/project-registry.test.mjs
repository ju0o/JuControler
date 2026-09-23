import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProjectRegistry } from '../src/project-registry.mjs';
import { loadProjectStatus, loadProjectStatusBoard } from '../src/project-status.mjs';

const registry = (projects) => ({ projects });
const entry = (projectId = 'jucontroler') => ({
  projectId,
  workspaceRoot: '/work/jucontroler',
  dataRoot: '/data/jucontroler',
  sourceRef: 'repository-status/jucontroler',
});

async function fixture(value) {
  const directory = await mkdtemp(join(tmpdir(), 'jucontroler-registry-'));
  const path = join(directory, 'registry.json');
  await writeFile(path, JSON.stringify(value));
  return path;
}

test('loads the explicitly selected project without writing to the registry', async () => {
  const path = await fixture(registry([entry()]));
  const before = await readFile(path, 'utf8');

  assert.deepEqual(await loadProjectRegistry(path, 'jucontroler'), entry());
  assert.equal(await readFile(path, 'utf8'), before);
});

test('fails closed for missing or invalid explicit entries', async (t) => {
  await t.test('missing projectId', async () => {
    const path = await fixture(registry([entry()]));
    await assert.rejects(() => loadProjectRegistry(path, ''), /projectId must be/);
  });
  await t.test('unknown projectId', async () => {
    const path = await fixture(registry([entry()]));
    await assert.rejects(() => loadProjectRegistry(path, 'other'), /was not found/);
  });
  await t.test('relative workspaceRoot', async () => {
    const invalidEntry = { ...entry(), workspaceRoot: 'work/jucontroler' };
    const path = await fixture(registry([invalidEntry]));
    await assert.rejects(() => loadProjectRegistry(path, 'jucontroler'), /must be absolute/);
  });
  await t.test('relative dataRoot', async () => {
    const invalidEntry = { ...entry(), dataRoot: 'data/jucontroler' };
    const path = await fixture(registry([invalidEntry]));
    await assert.rejects(() => loadProjectRegistry(path, 'jucontroler'), /dataRoot must be absolute/);
  });
  await t.test('missing sourceRef', async () => {
    const invalidEntry = { ...entry(), sourceRef: undefined };
    const path = await fixture(registry([invalidEntry]));
    await assert.rejects(() => loadProjectRegistry(path, 'jucontroler'), /sourceRef must be/);
  });
  await t.test('duplicate project IDs', async () => {
    const path = await fixture(registry([entry(), entry()]));
    await assert.rejects(() => loadProjectRegistry(path, 'jucontroler'), /is duplicated/);
  });
  await t.test('malformed registry JSON', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jucontroler-registry-'));
    const path = join(directory, 'registry.json');
    await writeFile(path, '{"projects":');
    await assert.rejects(() => loadProjectRegistry(path, 'jucontroler'), /Unable to read project registry/);
  });
  await t.test('unreadable registry path', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jucontroler-registry-'));
    await assert.rejects(
      () => loadProjectRegistry(join(directory, 'missing.json'), 'jucontroler'),
      /Unable to read project registry/
    );
  });
});

const status = (overrides = {}) => ({
  schema: 'project-status.v1',
  projectId: 'jucontroler',
  status: 'SOURCE_DEFINED',
  observedAt: '2026-09-23T00:00:00Z',
  source: { kind: 'repository-status-file', id: 'jucontroler/status' },
  ...overrides,
});

test('loads one source-owned status projection read-only and preserves opaque status', async () => {
  const path = await fixture(status());
  const before = await readFile(path, 'utf8');

  assert.deepEqual(await loadProjectStatus(path, 'jucontroler', {
    now: '2026-09-23T00:01:00Z',
    freshnessMs: 120000,
  }), {
    ...status(),
    generatedAt: '2026-09-23T00:01:00.000Z',
    stale: false,
  });
  assert.equal(await readFile(path, 'utf8'), before);
});

test('returns UNKNOWN and stale for unavailable, malformed, ambiguous, or expired observations', async (t) => {
  await t.test('missing file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jucontroler-status-'));
    const result = await loadProjectStatus(join(directory, 'current.json'), 'jucontroler');
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(result.stale, true);
  });
  await t.test('malformed and ambiguous files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jucontroler-status-'));
    const malformed = join(directory, 'malformed.json');
    await writeFile(malformed, '{"schema":');
    const ambiguous = await fixture(status({ status: '' }));
    assert.equal((await loadProjectStatus(malformed, 'jucontroler')).status, 'UNKNOWN');
    assert.equal((await loadProjectStatus(ambiguous, 'jucontroler')).status, 'UNKNOWN');
  });
  await t.test('expired observation preserves source status', async () => {
    const path = await fixture(status());
    const result = await loadProjectStatus(path, { projectId: 'jucontroler', now: '2026-09-23T00:03:00Z', freshnessMs: 60000 });
    assert.equal(result.status, 'SOURCE_DEFINED');
    assert.equal(result.stale, true);
  });
});

test('rejects unknown top-level or source fields fail-closed', async () => {
  for (const snapshot of [
    status({ command: 'restart' }),
    status({ source: { kind: 'repository-status-file', id: 'jucontroler/status', token: 'secret' } }),
    status({ generatedAt: 'yesterday' }),
  ]) {
    const result = await loadProjectStatus(await fixture(snapshot), 'jucontroler', { now: '2026-09-23T00:01:00Z' });
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(result.reason, 'invalid');
    assert.equal(result.stale, true);
  }
  const canonical = await loadProjectStatus(await fixture(status({
    status: 'UNKNOWN', generatedAt: '2026-09-23T00:00:00Z', stale: false, sourceRevision: 'abc123', reason: 'source-unknown',
  })), 'jucontroler', { now: '2026-09-23T00:01:00Z' });
  assert.equal(canonical.status, 'UNKNOWN');
  assert.equal(canonical.reason, 'source-unknown');
  assert.equal(canonical.sourceRevision, 'abc123');
});

test('loads the read-only status board in registry order', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jucontroler-board-'));
  const firstRoot = join(directory, 'first');
  const secondRoot = join(directory, 'second');
  const registryPath = join(directory, 'registry.json');
  const first = status({ projectId: 'first', status: 'OPAQUE_SOURCE_STATE' });
  await mkdir(firstRoot, { recursive: true });
  await writeFile(join(firstRoot, 'current.json'), JSON.stringify(first));
  await writeFile(registryPath, JSON.stringify(registry([
    { ...entry('first'), dataRoot: firstRoot },
    { ...entry('second'), dataRoot: secondRoot },
  ])));

  assert.deepEqual(await loadProjectStatusBoard(registryPath, {
    now: '2026-09-23T00:01:00Z',
    freshnessMs: 120000,
  }), [
    { ...first, generatedAt: '2026-09-23T00:01:00.000Z', stale: false },
    {
      schema: 'project-status.v1',
      projectId: 'second',
      status: 'UNKNOWN',
      observedAt: '2026-09-23T00:01:00.000Z',
      generatedAt: '2026-09-23T00:01:00.000Z',
      stale: true,
      source: { kind: 'repository-status-file', id: 'repository-status/jucontroler' },
      reason: 'unavailable',
    },
  ]);
});

test('invalid board projections retain the registry sourceRef', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jucontroler-board-'));
  const registryPath = join(directory, 'registry.json');
  const snapshot = JSON.stringify(status({ command: 'restart' }));
  await writeFile(join(directory, 'current.json'), snapshot);
  await writeFile(registryPath, JSON.stringify(registry([
    { ...entry(), dataRoot: directory, sourceRef: 'repository-status/canonical' },
  ])));

  const [result] = await loadProjectStatusBoard(registryPath, { now: '2026-09-23T00:01:00Z' });
  assert.equal(result.status, 'UNKNOWN');
  assert.equal(result.reason, 'invalid');
  assert.deepEqual(result.source, { kind: 'repository-status-file', id: 'repository-status/canonical' });
  assert.equal(await readFile(join(directory, 'current.json'), 'utf8'), snapshot);
});

test('rejects duplicate project IDs when loading the status board', async () => {
  const path = await fixture(registry([entry('duplicate'), entry('duplicate')]));

  await assert.rejects(() => loadProjectStatusBoard(path), /projectId duplicate is duplicated/);
});

test('rejects negative or non-numeric registry freshnessMs', async () => {
  for (const freshnessMs of [-1, '60000', null, 'Infinity']) {
    const path = await fixture(registry([{ ...entry(), freshnessMs }]));
    await assert.rejects(() => loadProjectRegistry(path, 'jucontroler'), /freshnessMs must be a nonnegative number/);
  }
  const path = await fixture(registry([{ ...entry(), freshnessMs: 0 }]));
  assert.equal((await loadProjectRegistry(path, 'jucontroler')).freshnessMs, 0);
});

test('rejects unknown top-level or entry registry fields fail-closed', async () => {
  const topLevel = await fixture({ ...registry([entry()]), command: 'restart' });
  await assert.rejects(() => loadProjectRegistry(topLevel, 'jucontroler'), /command is not a known field/);
  const entryField = await fixture(registry([{ ...entry(), token: 'secret' }]));
  await assert.rejects(() => loadProjectRegistry(entryField, 'jucontroler'), /projects\[0\]\.token is not a known field/);
  await assert.rejects(() => loadProjectStatusBoard(entryField), /projects\[0\]\.token is not a known field/);
  const valid = await fixture(registry([{ ...entry(), freshnessMs: 60000 }]));
  assert.deepEqual(await loadProjectRegistry(valid, 'jucontroler'), { ...entry(), freshnessMs: 60000 });
});

test('board applies each registry entry freshnessMs over the caller default', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jucontroler-board-'));
  const registryPath = join(directory, 'registry.json');
  const projects = [['strict', 30000], ['lenient', 600000], ['default', undefined]];
  for (const [projectId] of projects) {
    await mkdir(join(directory, projectId));
    await writeFile(join(directory, projectId, 'current.json'), JSON.stringify(status({ projectId })));
  }
  await writeFile(registryPath, JSON.stringify(registry(projects.map(([projectId, freshnessMs]) => (
    { ...entry(projectId), dataRoot: join(directory, projectId), freshnessMs }
  )))));

  const board = await loadProjectStatusBoard(registryPath, { now: '2026-09-23T00:01:00Z', maxAgeMs: 120000 });
  assert.deepEqual(board.map(({ projectId, stale }) => [projectId, stale]), [
    ['strict', true], ['lenient', false], ['default', false],
  ]);
});

test('board projects a juplan-status entry via the JuPlan adapter in registry order, read-only', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jucontroler-board-'));
  const registryPath = join(directory, 'registry.json');
  const saved = { projectId: 'juplan', status: 'PLANNING', observedAt: '2026-09-23T00:00:00Z', revision: 'r42' };
  for (const name of ['juplan', 'repo', 'bad']) await mkdir(join(directory, name));
  await writeFile(join(directory, 'juplan', 'current.json'), JSON.stringify(saved));
  await writeFile(join(directory, 'repo', 'current.json'), JSON.stringify(status({ projectId: 'repo' })));
  await writeFile(join(directory, 'bad', 'current.json'), '{"status":');
  await writeFile(registryPath, JSON.stringify(registry([
    { ...entry('juplan'), dataRoot: join(directory, 'juplan'), sourceKind: 'juplan-status' },
    { ...entry('repo'), dataRoot: join(directory, 'repo'), sourceKind: 'repository-status-file' },
    { ...entry('bad'), dataRoot: join(directory, 'bad'), sourceKind: 'juplan-status' },
    { ...entry('gone'), dataRoot: join(directory, 'gone'), sourceKind: 'juplan-status' },
    { ...entry('mismatch'), dataRoot: join(directory, 'juplan'), sourceKind: 'juplan-status' },
  ])));
  const before = await readdir(directory, { recursive: true });

  const board = await loadProjectStatusBoard(registryPath, { now: '2026-09-23T00:01:00Z' });
  assert.deepEqual(board[0], {
    schema: 'project-status.v1',
    projectId: 'juplan',
    status: 'PLANNING',
    observedAt: '2026-09-23T00:00:00Z',
    generatedAt: '2026-09-23T00:01:00.000Z',
    stale: false,
    source: { kind: 'juplan-status', id: 'juplan/juplan' },
    sourceRevision: 'r42',
  });
  assert.deepEqual(board.map((row) => [row.projectId, row.status, row.stale, row.reason, row.source.kind]), [
    ['juplan', 'PLANNING', false, undefined, 'juplan-status'],
    ['repo', 'SOURCE_DEFINED', false, undefined, 'repository-status-file'],
    ['bad', 'UNKNOWN', true, 'unavailable', 'juplan-status'],
    ['gone', 'UNKNOWN', true, 'unavailable', 'juplan-status'],
    ['mismatch', 'UNKNOWN', true, 'project-mismatch', 'juplan-status'],
  ]);
  assert.deepEqual(await readdir(directory, { recursive: true }), before);

  const select = (extra) => loadProjectStatusBoard(registryPath, { projectId: 'juplan', now: '2026-09-23T00:01:00Z', ...extra });
  const [invalid] = await select({ freshnessMs: -1 });
  assert.equal(invalid.status, 'UNKNOWN');
  assert.equal(invalid.reason, 'invalid-request');
  assert.equal((await select({ freshnessMs: 1000 }))[0].reason, 'stale');
});

test('rejects unknown registry sourceKind fail-closed', async () => {
  const path = await fixture(registry([{ ...entry(), sourceKind: 'shell-command' }]));
  await assert.rejects(() => loadProjectRegistry(path, 'jucontroler'), /sourceKind must be one of/);
  await assert.rejects(() => loadProjectStatusBoard(path), /sourceKind must be one of/);
});

test('board projects a juceipt-receipt entry via the JuCeipt adapter in registry order, read-only', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jucontroler-board-'));
  const registryPath = join(directory, 'registry.json');
  const receipt = { receipt_id: 'rcpt-7', acceptance: { state: 'ACCEPTED' }, generated_at: '2026-09-23T00:00:00Z' };
  for (const name of ['receipt', 'partial', 'bad']) await mkdir(join(directory, name));
  await writeFile(join(directory, 'receipt', 'current.json'), JSON.stringify(receipt));
  await writeFile(join(directory, 'partial', 'current.json'), JSON.stringify({ receipt_id: 'rcpt-8' }));
  await writeFile(join(directory, 'bad', 'current.json'), '{"receipt_id":');
  await writeFile(registryPath, JSON.stringify(registry([
    { ...entry('receipt'), dataRoot: join(directory, 'receipt'), sourceKind: 'juceipt-receipt' },
    { ...entry('partial'), dataRoot: join(directory, 'partial'), sourceKind: 'juceipt-receipt' },
    { ...entry('bad'), dataRoot: join(directory, 'bad'), sourceKind: 'juceipt-receipt' },
    { ...entry('gone'), dataRoot: join(directory, 'gone'), sourceKind: 'juceipt-receipt' },
  ])));
  const before = await readdir(directory, { recursive: true });

  const board = await loadProjectStatusBoard(registryPath, { now: '2026-09-23T00:01:00Z' });
  assert.deepEqual(board[0], {
    schema: 'project-status.v1',
    projectId: 'receipt',
    status: 'ACCEPTED',
    observedAt: '2026-09-23T00:00:00Z',
    generatedAt: '2026-09-23T00:01:00.000Z',
    stale: false,
    source: { kind: 'juceipt-receipt', id: 'juceipt/receipt' },
    sourceRevision: 'rcpt-7',
  });
  assert.deepEqual(board.map((row) => [row.projectId, row.status, row.stale, row.reason, row.source.kind]), [
    ['receipt', 'ACCEPTED', false, undefined, 'juceipt-receipt'],
    ['partial', 'UNKNOWN', true, 'missing-acceptance', 'juceipt-receipt'],
    ['bad', 'UNKNOWN', true, 'unavailable', 'juceipt-receipt'],
    ['gone', 'UNKNOWN', true, 'unavailable', 'juceipt-receipt'],
  ]);
  assert.deepEqual(await readdir(directory, { recursive: true }), before);

  const select = (extra) => loadProjectStatusBoard(registryPath, { projectId: 'receipt', now: '2026-09-23T00:01:00Z', ...extra });
  const [invalid] = await select({ freshnessMs: -1 });
  assert.equal(invalid.status, 'UNKNOWN');
  assert.equal(invalid.reason, 'invalid-request');
  assert.equal((await select({ freshnessMs: 1000 }))[0].reason, 'stale');
  assert.equal((await select({ now: '2026-09-22T23:59:00Z' }))[0].reason, 'future-generated-at');
});
