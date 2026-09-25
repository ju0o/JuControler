import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = JSON.parse(readFileSync(new URL('../docs/integration/tester-harness.schema.json', import.meta.url), 'utf8'));

test('Tester harness schema is closed, read-only, and separate from QA', () => {
  assert.equal(schema.properties.schema.const, 'tester-harness.v1');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ['schema', 'role', 'harnessId', 'projectId', 'permissions']);

  // Tester is its own role; it cannot be instantiated as QA and cannot judge results.
  assert.equal(schema.properties.role.const, 'tester');
  assert.equal(schema.properties.role.enum, undefined);

  const permissions = schema.properties.permissions;
  assert.equal(permissions.additionalProperties, false);
  assert.deepEqual(permissions.required, Object.keys(permissions.properties));
  assert.deepEqual(
    Object.fromEntries(Object.entries(permissions.properties).map(([key, value]) => [key, value.const])),
    { filesystem: 'read-only', repository: 'read-only', network: 'none', dispatch: false, verdict: false },
  );
});
