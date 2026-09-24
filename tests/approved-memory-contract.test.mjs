import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (name) => JSON.parse(readFileSync(new URL(`../docs/integration/${name}`, import.meta.url), 'utf8'));
const schema = load('approved-memory.schema.json');
const fixture = load('approved-memory.v1.json');

// What any agent of projectId receives: active, Founder-approved, global or its own project.
const project = ({ delivery, memories }, projectId) =>
  memories
    .filter((m) => m.status === delivery.status && m.approvedBy === delivery.approvedBy)
    .filter((m) => m.scope === 'global' || m.projectId === projectId)
    .map((m) => m.memoryId);

test('approved-memory contract is closed, read-only, and fixes one delivery rule for every role', () => {
  assert.equal(schema.properties.schema.const, 'approved-memory.v1');
  assert.equal(schema.additionalProperties, false);

  const delivery = schema.properties.delivery;
  assert.equal(delivery.additionalProperties, false);
  assert.deepEqual(delivery.required, Object.keys(delivery.properties));
  assert.deepEqual(delivery.properties.roles.const, ['pm', 'worker', 'qa']);
  assert.equal(delivery.properties.status.const, 'active');
  assert.equal(delivery.properties.approvedBy.const, 'founder');
  const permissions = delivery.properties.permissions;
  assert.equal(permissions.additionalProperties, false);
  assert.deepEqual(permissions.required, Object.keys(permissions.properties));
  const fixed = Object.fromEntries(Object.entries(permissions.properties).map(([key, value]) => [key, value.const]));
  assert.deepEqual(fixed, { write: false, approve: false, dispatch: false });

  const memory = schema.$defs.memory;
  assert.equal(memory.additionalProperties, false);
  assert.deepEqual(memory.required, Object.keys(memory.properties));
  assert.deepEqual(memory.properties.approvedBy.enum, ['founder', null]);
});

test('fixture conforms, and every agent gets approved memories but never a proposed QA lesson', () => {
  assert.deepEqual(Object.keys(fixture), schema.required);
  assert.equal(fixture.schema, schema.properties.schema.const);
  const delivery = schema.properties.delivery.properties;
  assert.deepEqual(fixture.delivery.roles, delivery.roles.const);
  assert.equal(fixture.delivery.status, delivery.status.const);
  assert.equal(fixture.delivery.approvedBy, delivery.approvedBy.const);
  assert.deepEqual(fixture.delivery.permissions, { write: false, approve: false, dispatch: false });

  const memory = schema.$defs.memory;
  const idPattern = new RegExp(memory.properties.memoryId.pattern);
  const projectIdPattern = new RegExp(memory.properties.projectId.pattern);
  const ids = new Set();
  for (const entry of fixture.memories) {
    assert.deepEqual(Object.keys(entry), memory.required);
    assert.match(entry.memoryId, idPattern);
    assert.ok(!ids.has(entry.memoryId), `duplicate ${entry.memoryId}`);
    ids.add(entry.memoryId);
    assert.ok(memory.properties.scope.enum.includes(entry.scope));
    assert.ok(memory.properties.origin.enum.includes(entry.origin));
    assert.ok(memory.properties.status.enum.includes(entry.status));
    if (entry.scope === 'global') assert.equal(entry.projectId, null);
    else assert.match(entry.projectId, projectIdPattern);
    assert.equal(entry.approvedBy, entry.status === 'active' ? 'founder' : null);
    assert.ok(entry.text.length > 0);
  }

  const lessons = fixture.memories.filter((m) => m.origin === 'qa-lesson' && m.status === 'proposed');
  assert.ok(lessons.length > 0, 'fixture must exercise a proposed QA lesson');

  // pm, worker, and qa share one projection; there is no role-specific filter.
  assert.deepEqual(project(fixture, 'jucontroler'), ['one-task-at-a-time', 'role-is-not-runtime']);
  assert.deepEqual(project(fixture, 'other-project'), ['one-task-at-a-time']);
  for (const lesson of lessons) assert.ok(!project(fixture, lesson.projectId).includes(lesson.memoryId));

  // Once the Founder approves a lesson it is delivered, with no other change.
  const approved = structuredClone(fixture);
  for (const m of approved.memories) if (m.origin === 'qa-lesson') Object.assign(m, { status: 'active', approvedBy: 'founder' });
  assert.ok(project(approved, 'jucontroler').includes('qa-rerun-listed-tests'));
});
