#!/usr/bin/env bash
# Offline, read-only E2E: builds a temp registry with one saved source per sourceKind,
# runs the status-board CLI against it, and prints exactly one JSON result line.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/jucontroler-e2e-XXXXXX")"
trap 'rm -rf "$tmp"' EXIT

now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
mkdir -p "$tmp/repo" "$tmp/plan" "$tmp/receipt" "$tmp/relay"
cat >"$tmp/repo/current.json" <<EOF
{"schema":"project-status.v1","projectId":"repo","status":"READY","observedAt":"$now","source":{"kind":"repository-status-file","id":"repo/status"}}
EOF
cat >"$tmp/plan/current.json" <<EOF
{"projectId":"plan","status":"PLANNING","observedAt":"$now"}
EOF
cat >"$tmp/receipt/current.json" <<EOF
{"receipt_id":"rcpt-e2e","acceptance":{"state":"ACCEPTED"},"generated_at":"$now"}
EOF
cat >"$tmp/relay/current.json" <<EOF
{"kind":"BOARD","observedAt":"$now","runner":{"day":"IDLE","night":"RUNNING"},"lanes":[{"id":"lane","state":"RUNNING","holds":[],"humanGate":null}]}
EOF
entry() { printf '{"projectId":"%s","workspaceRoot":"/work/%s","dataRoot":"%s","sourceRef":"e2e/%s","sourceKind":"%s"}' "$1" "$1" "$tmp/$2" "$1" "$3"; }
printf '{"projects":[%s,%s,%s,%s,%s,%s]}\n' \
  "$(entry repo repo repository-status-file)" \
  "$(entry plan plan juplan-status)" \
  "$(entry receipt receipt juceipt-receipt)" \
  "$(entry agent-relay relay agent-relay-board)" \
  "$(entry lane relay agent-relay-board)" \
  "$(entry missing none juplan-status)" >"$tmp/registry.json"

node "$root/scripts/status-board.mjs" "$tmp/registry.json" >"$tmp/board.json"

node - "$tmp/board.json" <<'EOF'
const board = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
const expected = [
  ['repo', 'READY', false], ['plan', 'PLANNING', false], ['receipt', 'ACCEPTED', false],
  ['agent-relay', 'day=IDLE;night=RUNNING', false], ['lane', 'RUNNING', false], ['missing', 'UNKNOWN', true],
];
const actual = board.map(({ projectId, status, stale }) => [projectId, status, stale]);
const ok = JSON.stringify(actual) === JSON.stringify(expected);
console.log(JSON.stringify({ schema: 'jucontroler.e2e.v1', ok, projects: board.length, statuses: Object.fromEntries(actual.map(([id, status]) => [id, status])) }));
process.exit(ok ? 0 : 1);
EOF
