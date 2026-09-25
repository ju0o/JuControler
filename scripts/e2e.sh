#!/usr/bin/env bash
# Offline, read-only E2E: builds a temp registry with one saved source per sourceKind,
# runs the status-board CLI against it, and prints exactly one JSON result line.
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/jucontroler-e2e-XXXXXX")" || exit 1
trap 'rm -rf "$tmp"' EXIT
start="${EPOCHREALTIME/,/.}" # bash 5 seconds.micros; some locales use a comma

build_registry() {
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  mkdir -p "$tmp/repo" "$tmp/plan" "$tmp/receipt" "$tmp/relay" || return 1
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
}

run_status_board() {
  node "$root/scripts/status-board.mjs" "$tmp/registry.json" >"$tmp/board.json" 2>"$tmp/board.err" &&
    printf '%s\n' '프로젝트 6개 중 1개는 상태를 알 수 없어요: missing(unavailable: 상태 파일이 없거나 읽을 수 없어요) — README 처음 쓰는 법의 reason 표를 보세요' | cmp -s - "$tmp/board.err"
}

check_projections() {
  node - "$tmp/board.json" "$tmp/summary.json" <<'EOF'
const fs = require('node:fs');
const board = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const expected = [
  ['repo', 'READY', false], ['plan', 'PLANNING', false], ['receipt', 'ACCEPTED', false],
  ['agent-relay', 'day=IDLE;night=RUNNING', false], ['lane', 'RUNNING', false], ['missing', 'UNKNOWN', true],
];
const actual = board.map(({ projectId, status, stale }) => [projectId, status, stale]);
fs.writeFileSync(process.argv[3], JSON.stringify({ projects: board.length, statuses: Object.fromEntries(actual.map(([id, status]) => [id, status])) }));
process.exit(JSON.stringify(actual) === JSON.stringify(expected) ? 0 : 1);
EOF
}

run_project_id() {
  node "$root/scripts/status-board.mjs" "$tmp/registry.json" --project-id lane >"$tmp/lane.json" &&
    node -e 'const b = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
process.exit(b.length === 1 && b[0].projectId === "lane" && b[0].status === "RUNNING" ? 0 : 1);' "$tmp/lane.json"
}

run_needs_action() {
  mkdir -p "$tmp/held" || return 1
  printf '{"kind":"BOARD","observedAt":"%s","lanes":[{"id":"held","state":"RUNNING","holds":["waiting"],"humanGate":null}]}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$tmp/held/current.json"
  printf '{"projects":[{"projectId":"held","workspaceRoot":"/work/held","dataRoot":"%s","sourceRef":"e2e/held","sourceKind":"agent-relay-board"}]}\n' "$tmp/held" >"$tmp/held-registry.json"
  node "$root/scripts/status-board.mjs" "$tmp/held-registry.json" >/dev/null 2>"$tmp/held.err" &&
    printf '%s\n' '프로젝트 1개 모두 상태를 읽었어요' '확인이 필요한 프로젝트: held(hold: 레인이 보류 중이에요) — 해당 레인의 확인 요청이나 보류를 처리하세요' | cmp -s - "$tmp/held.err"
}

# Steps run in order; after the first failure the rest are recorded as not ok without running.
steps=()
ok=true
for step in build_registry run_status_board check_projections run_project_id run_needs_action; do
  if [ "$ok" = true ] && "$step" >/dev/null 2>&1; then steps+=("$step:true"); else ok=false; steps+=("$step:false"); fi
done

node - "$ok" "$start" "$tmp/summary.json" "${steps[@]}" <<'EOF'
const fs = require('node:fs');
const [ok, start, summaryPath, ...steps] = process.argv.slice(2);
const summary = fs.existsSync(summaryPath) ? JSON.parse(fs.readFileSync(summaryPath, 'utf8')) : {};
const labels = { build_registry: '연습용 목록 만들기', run_status_board: '상태판 실행', check_projections: '상태 확인', run_project_id: '프로젝트 하나 조회', run_needs_action: '확인 필요 알림' };
const tests = 'node --test tests/*.test.mjs';
const board = 'node scripts/status-board.mjs <registry.json>';
const commands = { build_registry: tests, run_status_board: board, check_projections: tests, run_project_id: board, run_needs_action: board };
const failed = steps.find((step) => step.endsWith(':false'))?.split(':')[0];
console.log(JSON.stringify({
  schema: 'jucontroler.e2e.v1',
  ok: ok === 'true',
  message: failed ? labels[failed] + ' 단계에서 멈췄어요 — next의 명령을 직접 실행해 보세요' : '모두 정상이에요',
  ...(failed && { next: commands[failed] }),
  steps: steps.map((step) => ({ name: step.split(':')[0].replaceAll('_', '-'), label: labels[step.split(':')[0]], ok: step.endsWith(':true') })),
  ms: Math.round(Date.now() - Number(start) * 1000),
  ...summary,
}));
EOF
[ "$ok" = true ]
