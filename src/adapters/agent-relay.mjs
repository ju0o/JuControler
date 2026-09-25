// Read-only projection of one Agent Relay `night board` snapshot into project-status.v1 entries.
// The caller runs `night board` and passes the parsed JSON; this module never reads, spawns, or dials.

const schema = 'project-status.v1';
const sourceKind = 'agent-relay-board';
const runnerProjectId = 'agent-relay';

export class AgentRelayBoardError extends TypeError {
  constructor(code, message) {
    super(`Invalid Agent Relay board: ${message}`);
    this.name = 'AgentRelayBoardError';
    this.code = code;
  }
}

const text = (value) => typeof value === 'string' && value.trim() !== '';
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value) => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
  && Number.isFinite(Date.parse(value));

// Runner modes may be reported as a bare string or as { state }; anything else is not evidence.
const mode = (value) => text(value) ? value : object(value) && text(value.state) ? value.state : undefined;

function laneStatus(lane) {
  if (lane.holds !== undefined && !Array.isArray(lane.holds)) return { status: 'UNKNOWN', reason: 'invalid-holds' };
  if (!text(lane.state)) return { status: 'UNKNOWN', reason: 'missing-state' };
  // Hold and human gate are surfaced as reasons only; the lane's own state stays the status.
  if (lane.humanGate !== undefined && lane.humanGate !== null && lane.humanGate !== false) {
    return { status: lane.state, reason: 'human-gate' };
  }
  if (lane.holds?.length > 0) return { status: lane.state, reason: 'hold' };
  return { status: lane.state };
}

function runnerStatus(runner) {
  if (!object(runner)) return { status: 'UNKNOWN', reason: 'missing-runner' };
  const day = mode(runner.day);
  const night = mode(runner.night);
  if (day === undefined || night === undefined) return { status: 'UNKNOWN', reason: 'missing-runner-mode' };
  // Opaque composite of the source values; no mapping to a more familiar state.
  return { status: `day=${day};night=${night}` };
}

export function projectAgentRelayBoard(board, { now = new Date(), observedAt, freshnessMs = 5 * 60 * 1000 } = {}) {
  if (!object(board)) throw new AgentRelayBoardError('not-object', 'expected an object');
  if (board.kind !== 'BOARD') throw new AgentRelayBoardError('wrong-kind', 'kind must be BOARD');
  if (!Array.isArray(board.lanes)) throw new AgentRelayBoardError('invalid-lanes', 'lanes must be an array');
  if (board.runner !== undefined && !object(board.runner)) {
    throw new AgentRelayBoardError('invalid-runner', 'runner must be an object');
  }
  if (!Number.isFinite(freshnessMs) || freshnessMs < 0) {
    throw new AgentRelayBoardError('invalid-freshness', 'freshnessMs must be a non-negative number');
  }
  const ids = new Set([runnerProjectId]);
  for (const lane of board.lanes) {
    if (!object(lane) || !text(lane.id)) throw new AgentRelayBoardError('invalid-lane', 'every lane needs a text id');
    if (ids.has(lane.id)) throw new AgentRelayBoardError('duplicate-lane', `lane id ${lane.id} is duplicated`);
    ids.add(lane.id);
  }

  const nowDate = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(nowDate.getTime())) throw new AgentRelayBoardError('invalid-now', 'now must be a valid time');
  const generatedAt = nowDate.toISOString();
  const observed = [observedAt, board.observedAt, board.generatedAt].find(timestamp);
  const age = observed === undefined ? undefined : nowDate.getTime() - Date.parse(observed);
  // Missing or future timestamps are not fresh evidence.
  const staleReason = age === undefined ? 'missing-observedAt'
    : age < 0 ? 'future-observedAt' : age > freshnessMs ? 'stale' : undefined;

  const entry = (projectId, sourceId, { status, reason }, sourceRevision) => {
    const result = {
      schema,
      projectId,
      status,
      observedAt: observed ?? generatedAt,
      generatedAt,
      stale: staleReason !== undefined,
      source: { kind: sourceKind, id: sourceId },
    };
    if (text(sourceRevision)) result.sourceRevision = sourceRevision;
    if (reason ?? staleReason) result.reason = reason ?? staleReason;
    return result;
  };

  return [
    entry(runnerProjectId, 'agent-relay/runner', runnerStatus(board.runner)),
    ...board.lanes.map((lane) => entry(lane.id, `agent-relay/lanes/${lane.id}`, laneStatus(lane), lane.latestVersion)),
  ];
}
