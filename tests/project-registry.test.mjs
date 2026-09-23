import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
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
      source: { kind: 'repository-status-file', id: 'second' },
      reason: 'unavailable',
    },
  ]);
});

test('rejects duplicate project IDs when loading the status board', async () => {
  const path = await fixture(registry([entry('duplicate'), entry('duplicate')]));

  await assert.rejects(() => loadProjectStatusBoard(path), /projectId duplicate is duplicated/);
});
