import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProjectRegistry } from '../src/project-registry.mjs';

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
