import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentRelayBoardError, projectAgentRelayBoard } from '../src/adapters/agent-relay.mjs';

const now = '2026-09-23T00:01:00Z';
const observedAt = '2026-09-23T00:00:00Z';

const board = (lanes, extra = {}) => ({
  kind: 'BOARD',
  runner: { day: 'IDLE', night: 'RUNNING', notifier: 'ON', alwaysMode: false },
  lanes,
  models: {},
  approvals: [],
  observedAt,
  ...extra,
});

const lane = (id, fields) => ({
  id, workerChain: [], qaChain: [], counts: {}, integrationCommits: [], current: null, holds: [], humanGate: null, ...fields,
});

const byId = (entries) => Object.fromEntries(entries.map((entry) => [entry.projectId, entry]));

test('projects the runner and each lane, including actl, from source values', () => {
  const entries = byId(projectAgentRelayBoard(board([
    lane('jucontroler', { state: 'RUNNING', latestVersion: 'v1.2.3' }),
    lane('actl', { state: 'IDLE' }),
  ]), { now }));

  assert.deepEqual(Object.keys(entries), ['agent-relay', 'jucontroler', 'actl']);
  assert.deepEqual(entries['agent-relay'], {
    schema: 'project-status.v1',
    projectId: 'agent-relay',
    status: 'day=IDLE;night=RUNNING',
    observedAt,
    generatedAt: '2026-09-23T00:01:00.000Z',
    stale: false,
    source: { kind: 'agent-relay-board', id: 'agent-relay/runner' },
  });
  assert.equal(entries.jucontroler.status, 'RUNNING');
  assert.equal(entries.jucontroler.sourceRevision, 'v1.2.3');
  assert.equal(entries.jucontroler.reason, undefined);
  assert.equal(entries.actl.status, 'IDLE');
  assert.deepEqual(entries.actl.source, { kind: 'agent-relay-board', id: 'agent-relay/lanes/actl' });
});

test('surfaces hold and human gate as reasons without replacing the lane state', () => {
  const entries = byId(projectAgentRelayBoard(board([
    lane('held', { state: 'HOLD', holds: [{ reason: 'qa-failed' }] }),
    lane('gated', { state: 'WAITING', humanGate: { kind: 'approval' } }),
  ]), { now }));

  assert.equal(entries.held.status, 'HOLD');
  assert.equal(entries.held.reason, 'hold');
  assert.equal(entries.gated.status, 'WAITING');
  assert.equal(entries.gated.reason, 'human-gate');
});

test('missing or unsupported fields become UNKNOWN, never guessed', () => {
  const entries = byId(projectAgentRelayBoard({ kind: 'BOARD', lanes: [{ id: 'bare' }, lane('odd', { state: 'RUNNING', holds: 'x' })] }, { now }));

  assert.equal(entries['agent-relay'].status, 'UNKNOWN');
  assert.equal(entries['agent-relay'].reason, 'missing-runner');
  assert.equal(entries.bare.status, 'UNKNOWN');
  assert.equal(entries.bare.reason, 'missing-state');
  assert.equal(entries.odd.status, 'UNKNOWN');
  assert.equal(entries.odd.reason, 'invalid-holds');
  for (const entry of Object.values(entries)) assert.equal(entry.stale, true);

  const partial = byId(projectAgentRelayBoard(board([], { runner: { day: 'IDLE' } }), { now }));
  assert.equal(partial['agent-relay'].status, 'UNKNOWN');
  assert.equal(partial['agent-relay'].reason, 'missing-runner-mode');
});

test('missing, old, or future observation time is stale', () => {
  const [missing] = projectAgentRelayBoard(board([], { observedAt: undefined }), { now });
  assert.equal(missing.stale, true);
  assert.equal(missing.reason, 'missing-observedAt');
  const [old] = projectAgentRelayBoard(board([]), { now, freshnessMs: 1000 });
  assert.equal(old.stale, true);
  assert.equal(old.reason, 'stale');
  assert.equal(old.status, 'day=IDLE;night=RUNNING');
  const [future] = projectAgentRelayBoard(board([], { observedAt: '2026-09-24T00:00:00Z' }), { now });
  assert.equal(future.reason, 'future-observedAt');
  const [caller] = projectAgentRelayBoard(board([], { observedAt: undefined }), { now, observedAt });
  assert.equal(caller.stale, false);
  assert.equal(caller.observedAt, observedAt);
});

test('malformed boards reject with a typed error', () => {
  const cases = [
    [null, 'not-object'],
    [[], 'not-object'],
    [{ kind: 'LANES', lanes: [] }, 'wrong-kind'],
    [{ kind: 'BOARD', lanes: {} }, 'invalid-lanes'],
    [{ kind: 'BOARD', lanes: [], runner: 'up' }, 'invalid-runner'],
    [{ kind: 'BOARD', lanes: [{ state: 'RUNNING' }] }, 'invalid-lane'],
    [{ kind: 'BOARD', lanes: ['actl'] }, 'invalid-lane'],
    [{ kind: 'BOARD', lanes: [{ id: 'a' }, { id: 'a' }] }, 'duplicate-lane'],
    [{ kind: 'BOARD', lanes: [{ id: 'agent-relay' }] }, 'duplicate-lane'],
  ];
  for (const [input, code] of cases) {
    assert.throws(() => projectAgentRelayBoard(input, { now }), (error) => error instanceof AgentRelayBoardError
      && error instanceof TypeError && error.code === code);
  }
});
