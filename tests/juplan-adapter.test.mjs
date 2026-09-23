import test from 'node:test';
import assert from 'node:assert/strict';
import { JuPlanStatusError, projectJuPlanStatus } from '../src/adapters/juplan.mjs';

const now = '2026-09-23T00:01:00Z';
const observedAt = '2026-09-23T00:00:00Z';

test('projects a saved JuPlan status verbatim', () => {
  assert.deepEqual(projectJuPlanStatus({ projectId: 'juplan', status: 'PLANNING', observedAt, revision: 'r42' }, { now }), {
    schema: 'project-status.v1',
    projectId: 'juplan',
    status: 'PLANNING',
    observedAt,
    generatedAt: '2026-09-23T00:01:00.000Z',
    stale: false,
    source: { kind: 'juplan-status', id: 'juplan/juplan' },
    sourceRevision: 'r42',
  });
  const other = projectJuPlanStatus({ status: 'odd-value', updatedAt: observedAt }, { now, projectId: 'actl' });
  assert.equal(other.status, 'odd-value');
  assert.equal(other.projectId, 'actl');
  assert.equal(other.stale, false);
  assert.deepEqual(other.source, { kind: 'juplan-status', id: 'juplan/actl' });
});

test('unusable source data becomes UNKNOWN and stale, never guessed', () => {
  const cases = [
    [null, 'malformed'],
    [[], 'malformed'],
    ['READY', 'malformed'],
    [{ projectId: 'other', status: 'READY', observedAt }, 'project-mismatch'],
    [{ status: 'READY', observedAt, stale: 'no' }, 'invalid-stale'],
    [{ observedAt, revision: 'r1' }, 'missing-status'],
    [{ status: '  ', observedAt }, 'missing-status'],
  ];
  for (const [input, reason] of cases) {
    const entry = projectJuPlanStatus(input, { now });
    assert.equal(entry.status, 'UNKNOWN', reason);
    assert.equal(entry.reason, reason);
    assert.equal(entry.stale, true);
    assert.equal(entry.sourceRevision, undefined);
    assert.equal(entry.observedAt, '2026-09-23T00:01:00.000Z');
  }
});

test('missing, old, future, or source-flagged observations are stale', () => {
  const at = (extra, options = {}) => projectJuPlanStatus({ status: 'READY', ...extra }, { now, ...options });
  assert.equal(at({}).reason, 'missing-observedAt');
  assert.equal(at({ observedAt: '2026-09-23 00:00:00' }).reason, 'missing-observedAt');
  assert.equal(at({ observedAt }, { freshnessMs: 1000 }).reason, 'stale');
  assert.equal(at({ observedAt: '2026-09-24T00:00:00Z' }).reason, 'future-observedAt');
  const flagged = at({ observedAt, stale: true });
  assert.equal(flagged.reason, 'source-stale');
  assert.equal(flagged.stale, true);
  assert.equal(flagged.status, 'READY');
  const caller = at({}, { observedAt });
  assert.equal(caller.stale, false);
  assert.equal(caller.observedAt, observedAt);
});

test('invalid options reject with a typed error', () => {
  const cases = [
    [{ projectId: '' }, 'invalid-project-id'],
    [{ freshnessMs: -1 }, 'invalid-freshness'],
    [{ now: 'nope' }, 'invalid-now'],
  ];
  for (const [options, code] of cases) {
    assert.throws(() => projectJuPlanStatus({ status: 'READY' }, options), (error) => error instanceof JuPlanStatusError
      && error instanceof TypeError && error.code === code);
  }
});
