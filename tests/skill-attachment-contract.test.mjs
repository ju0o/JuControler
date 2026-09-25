import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (name) => JSON.parse(readFileSync(new URL(`../docs/integration/${name}`, import.meta.url), 'utf8'));
const schema = load('skill-attachment.schema.json');
const fixture = load('skill-attachment.v1.json');

test('Skill attachment contract is closed, read-only, and makes every project x role selection explicit', () => {
  assert.equal(schema.properties.schema.const, 'skill-attachment.v1');
  assert.equal(schema.additionalProperties, false);

  const attachment = schema.$defs.attachment;
  assert.equal(attachment.additionalProperties, false);
  assert.deepEqual(attachment.required, Object.keys(attachment.properties));
  const roles = attachment.properties.role.enum;
  assert.deepEqual(roles, ['pm', 'worker', 'qa']);

  const permissions = attachment.properties.permissions;
  assert.equal(permissions.additionalProperties, false);
  assert.deepEqual(permissions.required, Object.keys(permissions.properties));
  const fixed = Object.fromEntries(Object.entries(permissions.properties).map(([key, value]) => [key, value.const]));
  assert.deepEqual(fixed, { install: false, dispatch: false, overwrite: false });

  // The fixture conforms to the schema: each (projectId, role) once, and every project covers pm, worker, qa.
  assert.deepEqual(Object.keys(fixture), schema.required);
  assert.equal(fixture.schema, schema.properties.schema.const);
  const projectIdPattern = new RegExp(attachment.properties.projectId.pattern);
  const skillIdPattern = new RegExp(attachment.properties.skillIds.items.pattern);
  const rolesByProject = new Map();
  for (const entry of fixture.attachments) {
    assert.deepEqual(Object.keys(entry), attachment.required);
    assert.match(entry.projectId, projectIdPattern);
    assert.ok(roles.includes(entry.role), `unknown role ${entry.role}`);
    assert.ok(Array.isArray(entry.skillIds));
    assert.equal(new Set(entry.skillIds).size, entry.skillIds.length);
    for (const skillId of entry.skillIds) assert.match(skillId, skillIdPattern);
    assert.deepEqual(entry.permissions, fixed);
    const seen = rolesByProject.get(entry.projectId) ?? [];
    assert.ok(!seen.includes(entry.role), `duplicate ${entry.projectId} x ${entry.role}`);
    rolesByProject.set(entry.projectId, [...seen, entry.role]);
  }
  assert.ok(rolesByProject.has('jucontroler'));
  for (const projectRoles of rolesByProject.values()) assert.deepEqual([...projectRoles].sort(), [...roles].sort());
});
