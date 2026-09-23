import test from 'node:test';
import assert from 'node:assert/strict';
import { JuCeiptReceiptError, projectJuCeiptReceipt } from '../src/adapters/juceipt.mjs';

const now = '2026-09-23T00:01:00Z';
const generated_at = '2026-09-23T00:00:00Z';
const receipt = (extra = {}) => ({ receipt_id: 'rcpt-7', acceptance: { state: 'ACCEPTED' }, generated_at, ...extra });

test('projects a saved receipt verbatim with receipt_id as sourceRevision', () => {
  assert.deepEqual(projectJuCeiptReceipt(receipt(), { now }), {
    schema: 'project-status.v1',
    projectId: 'juceipt',
    status: 'ACCEPTED',
    observedAt: generated_at,
    generatedAt: '2026-09-23T00:01:00.000Z',
    stale: false,
    source: { kind: 'juceipt-receipt', id: 'juceipt/juceipt' },
    sourceRevision: 'rcpt-7',
  });
  const other = projectJuCeiptReceipt(receipt({ acceptance: { state: 'odd-value' } }), { now, projectId: 'actl' });
  assert.equal(other.status, 'odd-value');
  assert.deepEqual(other.source, { kind: 'juceipt-receipt', id: 'juceipt/actl' });
});

test('malformed or incomplete receipts become UNKNOWN and stale, never guessed', () => {
  const cases = [
    [null, 'malformed'],
    [[], 'malformed'],
    ['ACCEPTED', 'malformed'],
    [receipt({ receipt_id: undefined }), 'missing-receipt-id'],
    [receipt({ receipt_id: ' ' }), 'missing-receipt-id'],
    [receipt({ acceptance: undefined }), 'missing-acceptance'],
    [receipt({ acceptance: 'ACCEPTED' }), 'missing-acceptance'],
    [receipt({ acceptance: {} }), 'missing-acceptance-state'],
    [receipt({ acceptance: { state: 1 } }), 'missing-acceptance-state'],
    [receipt({ generated_at: undefined }), 'missing-generated-at'],
    [receipt({ generated_at: '2026-09-23 00:00:00' }), 'missing-generated-at'],
  ];
  for (const [input, reason] of cases) {
    const entry = projectJuCeiptReceipt(input, { now });
    assert.equal(entry.status, 'UNKNOWN', reason);
    assert.equal(entry.reason, reason);
    assert.equal(entry.stale, true);
    assert.equal(entry.sourceRevision, undefined);
    assert.equal(entry.observedAt, '2026-09-23T00:01:00.000Z');
  }
});

test('old or future receipts keep their state but are stale', () => {
  const old = projectJuCeiptReceipt(receipt(), { now, freshnessMs: 1000 });
  assert.deepEqual([old.status, old.stale, old.reason, old.sourceRevision], ['ACCEPTED', true, 'stale', 'rcpt-7']);
  const future = projectJuCeiptReceipt(receipt({ generated_at: '2026-09-24T00:00:00Z' }), { now });
  assert.deepEqual([future.stale, future.reason], [true, 'future-generated-at']);
});

test('invalid options reject with a typed error', () => {
  const cases = [
    [{ projectId: '' }, 'invalid-project-id'],
    [{ freshnessMs: -1 }, 'invalid-freshness'],
    [{ now: 'nope' }, 'invalid-now'],
  ];
  for (const [options, code] of cases) {
    assert.throws(() => projectJuCeiptReceipt(receipt(), options), (error) => error instanceof JuCeiptReceiptError
      && error instanceof TypeError && error.code === code);
  }
});
