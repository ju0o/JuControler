import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import assert from 'node:assert/strict';

const script = new URL('../scripts/e2e.sh', import.meta.url).pathname;

test('scripts/e2e.sh prints one jucontroler.e2e.v1 JSON line with ordered passing steps', async () => {
  const { stdout } = await promisify(execFile)('bash', [script]);
  const lines = stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 1);
  const result = JSON.parse(lines[0]);
  const { ms, ...rest } = result;
  assert.ok(Number.isInteger(ms) && ms >= 0);
  assert.deepEqual(rest, {
    schema: 'jucontroler.e2e.v1',
    ok: true,
    message: '모두 정상이에요',
    steps: ['build-registry', 'run-status-board', 'check-projections', 'run-project-id', 'run-needs-action'].map((name) => ({ name, ok: true })),
    projects: 6,
    statuses: {
      repo: 'READY',
      plan: 'PLANNING',
      receipt: 'ACCEPTED',
      'agent-relay': 'day=IDLE;night=RUNNING',
      lane: 'RUNNING',
      missing: 'UNKNOWN',
    },
  });
  assert.deepEqual(Object.keys(result), ['schema', 'ok', 'message', 'steps', 'ms', 'projects', 'statuses']);
});
