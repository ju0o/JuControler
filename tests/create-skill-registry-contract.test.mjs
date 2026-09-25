import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (name) => JSON.parse(readFileSync(new URL(`../docs/integration/${name}`, import.meta.url), 'utf8'));
const schema = load('create-skill-registry.schema.json');
const registry = load('create-skill-registry.v1.json');

test('Create Skill registry is closed, read-only, and covers every target agent plus the supervisor', () => {
  assert.equal(schema.properties.schema.const, 'create-skill-registry.v1');
  assert.equal(schema.additionalProperties, false);

  const skill = schema.$defs.skill;
  assert.equal(skill.additionalProperties, false);
  assert.deepEqual(skill.required, Object.keys(skill.properties));

  const permissions = skill.properties.permissions;
  assert.equal(permissions.additionalProperties, false);
  assert.deepEqual(permissions.required, Object.keys(permissions.properties));
  const fixed = Object.fromEntries(Object.entries(permissions.properties).map(([key, value]) => [key, value.const]));
  assert.deepEqual(fixed, {
    filesystem: 'read-only', repository: 'read-only', network: 'none', dispatch: false, install: false, verdict: false,
  });

  // The registered instance conforms to the schema and lists each agent exactly once.
  assert.deepEqual(Object.keys(registry), schema.required);
  assert.equal(registry.schema, schema.properties.schema.const);
  const agentIds = registry.skills.map((entry) => entry.agentId);
  assert.deepEqual(agentIds, skill.properties.agentId.enum);
  const skillIdPattern = new RegExp(skill.properties.skillId.pattern);
  for (const entry of registry.skills) {
    assert.deepEqual(Object.keys(entry), skill.required);
    assert.match(entry.skillId, skillIdPattern);
    assert.equal(entry.skillId, `create-skill.${entry.agentId}`);
    assert.deepEqual(entry.permissions, fixed);
  }
});
