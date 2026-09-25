import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (name) => JSON.parse(readFileSync(new URL(`../docs/integration/${name}`, import.meta.url), 'utf8'));
const schema = load('ai-assignment.schema.json');
const fixture = load('ai-assignment.v1.json');

test('AI assignment contract is closed, read-only, covers every role, and orders subscribed before free', () => {
  assert.equal(schema.properties.schema.const, 'ai-assignment.v1');
  assert.equal(schema.additionalProperties, false);

  const assignment = schema.$defs.assignment;
  assert.equal(assignment.additionalProperties, false);
  assert.deepEqual(assignment.required, Object.keys(assignment.properties));
  const roles = assignment.properties.role.enum;
  assert.deepEqual(roles, ['pm', 'worker', 'qa', 'tester']);

  const choice = schema.$defs.choice;
  assert.equal(choice.additionalProperties, false);
  assert.deepEqual(choice.required, Object.keys(choice.properties));
  const tiers = choice.properties.tier.enum;
  assert.deepEqual(tiers, ['subscribed', 'free']);

  const permissions = assignment.properties.permissions;
  assert.equal(permissions.additionalProperties, false);
  assert.deepEqual(permissions.required, Object.keys(permissions.properties));
  const fixed = Object.fromEntries(Object.entries(permissions.properties).map(([key, value]) => [key, value.const]));
  assert.deepEqual(fixed, { dispatch: false, install: false, createAccount: false });

  // The fixture conforms to the schema: each role once, and no free choice is tried before a subscribed one.
  assert.deepEqual(Object.keys(fixture), schema.required);
  assert.equal(fixture.schema, schema.properties.schema.const);
  const runtimePattern = new RegExp(choice.properties.runtime.pattern);
  const seen = [];
  for (const entry of fixture.assignments) {
    assert.deepEqual(Object.keys(entry), assignment.required);
    assert.ok(roles.includes(entry.role), `unknown role ${entry.role}`);
    assert.ok(!seen.includes(entry.role), `duplicate role ${entry.role}`);
    seen.push(entry.role);
    assert.ok(entry.choices.length >= 1);
    assert.equal(new Set(entry.choices.map((c) => c.runtime)).size, entry.choices.length);
    let freeSeen = false;
    for (const c of entry.choices) {
      assert.deepEqual(Object.keys(c), choice.required);
      assert.match(c.runtime, runtimePattern);
      assert.ok(tiers.includes(c.tier), `unknown tier ${c.tier}`);
      if (c.tier === 'free') freeSeen = true;
      else assert.ok(!freeSeen, `${entry.role}: subscribed ${c.runtime} comes after a free choice`);
    }
    assert.deepEqual(entry.permissions, fixed);
  }
  assert.deepEqual([...seen].sort(), [...roles].sort());
});
