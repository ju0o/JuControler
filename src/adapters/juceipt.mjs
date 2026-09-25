// Read-only projection of one saved JuCeipt receipt JSON into a project-status.v1 entry.
// The caller reads the file and passes the parsed JSON; this module never reads, spawns, or dials.
// Source data never throws: a malformed or incomplete receipt becomes UNKNOWN. Only invalid caller options throw.

const schema = 'project-status.v1';
const sourceKind = 'juceipt-receipt';

export class JuCeiptReceiptError extends TypeError {
  constructor(code, message) {
    super(`Invalid JuCeipt receipt options: ${message}`);
    this.name = 'JuCeiptReceiptError';
    this.code = code;
  }
}

const text = (value) => typeof value === 'string' && value.trim() !== '';
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value) => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
  && Number.isFinite(Date.parse(value));

// Every field the projection relies on must be present; a partial receipt is not evidence.
function receiptReason(receipt) {
  if (!object(receipt)) return 'malformed';
  if (!text(receipt.receipt_id)) return 'missing-receipt-id';
  if (!object(receipt.acceptance)) return 'missing-acceptance';
  if (!text(receipt.acceptance.state)) return 'missing-acceptance-state';
  if (!timestamp(receipt.generated_at)) return 'missing-generated-at';
  return undefined;
}

export function projectJuCeiptReceipt(receipt, { projectId = 'juceipt', now = new Date(), freshnessMs = 5 * 60 * 1000 } = {}) {
  if (!text(projectId)) throw new JuCeiptReceiptError('invalid-project-id', 'projectId must be text');
  if (!Number.isFinite(freshnessMs) || freshnessMs < 0) {
    throw new JuCeiptReceiptError('invalid-freshness', 'freshnessMs must be a non-negative number');
  }
  const nowDate = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(nowDate.getTime())) throw new JuCeiptReceiptError('invalid-now', 'now must be a valid time');
  const generatedAt = nowDate.toISOString();
  const source = { kind: sourceKind, id: `juceipt/${projectId}` };

  const reason = receiptReason(receipt);
  if (reason !== undefined) {
    return { schema, projectId, status: 'UNKNOWN', observedAt: generatedAt, generatedAt, stale: true, source, reason };
  }

  const age = nowDate.getTime() - Date.parse(receipt.generated_at);
  const staleReason = age < 0 ? 'future-generated-at' : age > freshnessMs ? 'stale' : undefined;
  const result = {
    schema,
    projectId,
    status: receipt.acceptance.state,
    observedAt: receipt.generated_at,
    generatedAt,
    stale: staleReason !== undefined,
    source,
    sourceRevision: receipt.receipt_id,
  };
  if (staleReason) result.reason = staleReason;
  return result;
}
