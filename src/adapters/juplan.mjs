// Read-only projection of one saved JuPlan status JSON into a project-status.v1 entry.
// The caller reads the file and passes the parsed JSON; this module never reads, spawns, or dials.
// Source data never throws: anything unusable becomes UNKNOWN. Only invalid caller options throw.

const schema = 'project-status.v1';
const sourceKind = 'juplan-status';

export class JuPlanStatusError extends TypeError {
  constructor(code, message) {
    super(`Invalid JuPlan status options: ${message}`);
    this.name = 'JuPlanStatusError';
    this.code = code;
  }
}

const text = (value) => typeof value === 'string' && value.trim() !== '';
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value) => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
  && Number.isFinite(Date.parse(value));

function sourceStatus(saved, projectId) {
  if (!object(saved)) return { reason: 'malformed' };
  if (saved.projectId !== undefined && saved.projectId !== projectId) return { reason: 'project-mismatch' };
  if (saved.stale !== undefined && typeof saved.stale !== 'boolean') return { reason: 'invalid-stale' };
  if (!text(saved.status)) return { reason: 'missing-status' };
  return { status: saved.status };
}

export function projectJuPlanStatus(saved, { projectId = 'juplan', now = new Date(), observedAt, freshnessMs = 5 * 60 * 1000 } = {}) {
  if (!text(projectId)) throw new JuPlanStatusError('invalid-project-id', 'projectId must be text');
  if (!Number.isFinite(freshnessMs) || freshnessMs < 0) {
    throw new JuPlanStatusError('invalid-freshness', 'freshnessMs must be a non-negative number');
  }
  const nowDate = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(nowDate.getTime())) throw new JuPlanStatusError('invalid-now', 'now must be a valid time');
  const generatedAt = nowDate.toISOString();

  const { status = 'UNKNOWN', reason } = sourceStatus(saved, projectId);
  const usable = reason === undefined;
  const observed = [observedAt, ...(usable ? [saved.observedAt, saved.updatedAt] : [])].find(timestamp);
  const age = observed === undefined ? undefined : nowDate.getTime() - Date.parse(observed);
  // Missing or future timestamps are not fresh evidence; the source may also flag itself stale.
  const staleReason = age === undefined ? 'missing-observedAt'
    : age < 0 ? 'future-observedAt' : age > freshnessMs ? 'stale'
      : usable && saved.stale === true ? 'source-stale' : undefined;

  const result = {
    schema,
    projectId,
    status,
    observedAt: observed ?? generatedAt,
    generatedAt,
    // No valid last-known status is never fresh evidence.
    stale: !usable || staleReason !== undefined,
    source: { kind: sourceKind, id: `juplan/${projectId}` },
  };
  if (usable && text(saved.revision)) result.sourceRevision = saved.revision;
  if (reason ?? staleReason) result.reason = reason ?? staleReason;
  return result;
}
