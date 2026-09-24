# JuControler

One CLI to operate a portfolio of AI-built software projects.

JuControler is a local-first, CLI-first control plane: bounded PM/Builder/
Reviewer/QA/Operations Harnesses route work to interchangeable coding-agent
runtimes, accept results only against independent evidence, and keep autonomy
inside explicit resource and human-approval limits.

**Current direction (VNext, 2026-09-13):** Role is not Runtime — Harnesses
(PM, Builder, Reviewer, QA) are separate from the Agent runtime executing
them. Orchestration is deterministic control plus bounded LLM reasoning, not
a single required orchestration-brain process. Existing components (Agent
Relay's managed-work protocol, actl's runtime control, tmux transport) remain
independent projects that JuControler adapts rather than vendors. Target
agents are Claude Code, Codex, OpenCode, Cursor, CommandCode, Cline, and Grok;
these are integration targets, not a claim of certified runtime support.

**Historical proof:** an earlier architecture iteration (internal planning
documents, not part of this public checkout) certified a working
Relay↔actl↔tmux↔Codex managed-Task loop end-to-end, including runtime
identity, writer reservation, result correlation, independent verification,
and reboot/runtime-loss recovery. That evidence carries forward into the
current direction as a migration input; the architecture role it once
assigned to a single required orchestration-brain process does not.

**Current status: V0 NOT CERTIFIED.** This checkout does not yet contain an
implemented integration runtime or a certified end-to-end loop under the
current direction. The only runnable surface is the read-only status board
below.

## 처음 쓰는 법

준비물은 Node.js 22 이상과 bash뿐입니다. 따로 설치할 것도 없고, 인터넷도
쓰지 않습니다. 저장소 맨 위 폴더에서 아래 명령을 차례로 입력하세요.

```sh
bash scripts/e2e.sh
node --test tests/*.test.mjs
node scripts/status-board.mjs <registry.json> [--project-id <id>]
```

1. `bash scripts/e2e.sh` — 전체 흐름을 한 번에 점검합니다. 임시 폴더에 연습용
   프로젝트 목록(registry)을 만들고, 상태판을 돌려 보고, 결과를 확인한 뒤
   임시 폴더를 지웁니다. 아무것도 바꾸지 않습니다.
2. `node --test tests/*.test.mjs` — `tests` 폴더의 자동 테스트 파일 일곱 개를
   모두 돌립니다(어댑터, 테스터 하네스, 스킬 만들기 약속 확인 포함). 인터넷은
   쓰지 않습니다. 마지막에 `fail 0`이 나오면 정상입니다.
3. `node scripts/status-board.mjs <registry.json>` — 내 프로젝트 목록 파일로
   상태판을 봅니다. `--project-id <id>`를 붙이면 그 프로젝트 하나만 보여 줍니다.

`bash scripts/e2e.sh`는 JSON 한 줄만 출력합니다. 예시:

```json
{"schema":"jucontroler.e2e.v1","ok":true,"message":"모두 정상이에요","steps":[{"name":"build-registry","ok":true},{"name":"run-status-board","ok":true},{"name":"check-projections","ok":true},{"name":"run-project-id","ok":true}],"ms":1744,"projects":6,"statuses":{"repo":"READY","plan":"PLANNING","receipt":"ACCEPTED","agent-relay":"day=IDLE;night=RUNNING","lane":"RUNNING","missing":"UNKNOWN"}}
```

읽는 법:

- `ok` — 모든 단계가 통과하면 `true`입니다. 이때만 종료 코드가 `0`입니다.
- `message` — 결과를 쉬운 한국어 한 문장으로 알려 줍니다. 정상이면 `모두 정상이에요`,
  실패하면 처음 멈춘 단계를 알려 줍니다(예: `상태판 실행 단계에서 멈췄어요 — 아래
  명령을 직접 실행해 보세요`). 이때 위 `처음 쓰는 법`의 명령을 차례로 직접 실행해 보세요.
- `steps` — 단계별 결과입니다. 하나가 실패하면 그 뒤 단계는 실행하지 않고
  `ok: false`로 적습니다.
  - `build-registry`: 연습용 프로젝트 목록 만들기
  - `run-status-board`: 상태판 실행
  - `check-projections`: 여섯 프로젝트의 상태가 예상과 같은지 확인
  - `run-project-id`: `--project-id lane`으로 프로젝트 하나만 조회
- `ms` — 전체 실행 시간(밀리초)입니다. 실행할 때마다 조금씩 다릅니다.
- `projects`, `statuses` — 상태판에 나온 프로젝트 수와 각 상태입니다.

연습용 목록에는 `sourceKind` 네 종류(`repository-status-file`,
`juplan-status`, `juceipt-receipt`, `agent-relay-board`)가 하나씩 들어 있습니다.
`agent-relay-board` 항목은 `<dataRoot>/current.json`에 저장된 `night board`
스냅샷을 읽고, `projectId`가 `agent-relay`이면 러너를, 그 밖이면 같은 id의
레인을 보여 줍니다. 없는 레인은 `UNKNOWN`(이유 `missing-lane`)으로 나옵니다.

내 `registry.json`은 아래를 복사해서 값만 바꾸면 됩니다.

```json
{
  "projects": [
    {
      "projectId": "my-project",
      "workspaceRoot": "/home/me/my-project",
      "dataRoot": "/home/me/.local/share/my-project",
      "sourceRef": "my-project/status",
      "sourceKind": "repository-status-file"
    }
  ]
}
```

- `workspaceRoot`, `dataRoot`는 `/`로 시작하는 절대 경로여야 합니다.
- 위에 없는 칸(`freshnessMs` 제외)을 넣으면 오류가 납니다.
- `sourceKind`는 빼도 되고(그러면 `repository-status-file`), 넣으려면 위 네 종류 중 하나만 씁니다.
- `current.json`은 각 항목의 `dataRoot` 폴더 바로 안(`<dataRoot>/current.json`)에 둡니다.
- `UNKNOWN`은 그 파일이 없거나 읽을 수 없어서 상태를 알 수 없다는 뜻입니다.

상태판에 `reason`이 보이면 아래 표로 뜻과 다음 할 일을 확인하세요.

| `reason` | 뜻 | 다음 할 일 |
| --- | --- | --- |
| `unavailable` | `current.json`이 없거나 JSON으로 읽을 수 없어요. | `<dataRoot>/current.json`이 있는지, 올바른 JSON인지 확인하세요. |
| `invalid-request` | 요청 값(`projectId`나 `freshnessMs`)이 잘못됐어요. | `registry.json`의 `projectId`와 `freshnessMs`(0 이상 숫자)를 고치세요. |
| `malformed` | 저장된 값이 JSON 객체가 아니에요. | 파일 내용이 `{ ... }` 모양인지 확인하세요. |
| `project-mismatch` | 파일 속 `projectId`가 목록의 `projectId`와 달라요. | 두 값을 같게 맞추세요. |
| `invalid-stale` | 파일 속 `stale`이 `true`/`false`가 아니에요. | `stale`을 `true`나 `false`로 고치거나 지우세요. |
| `missing-status` | 파일에 `status`가 없거나 비어 있어요. | 원본에서 `status`를 채워 다시 저장하세요. |
| `missing-lane` | 보드 스냅샷에 그 id의 레인이 없어요. | `projectId`가 레인 id와 같은지 확인하세요. |
| `missing-state` | 레인의 `state`가 없거나 비어 있어요. | Agent Relay 보드 스냅샷을 새로 저장하세요. |
| `invalid-holds` | 레인의 `holds`가 목록(배열)이 아니에요. | 보드 스냅샷을 새로 저장하세요. |
| `human-gate` | 사람 확인을 기다리는 레인이에요. 상태는 그대로예요. | 해당 레인의 확인 요청을 처리하세요. |
| `hold` | 레인이 보류 중이에요. 상태는 그대로예요. | 보류 이유를 확인하고 풀어 주세요. |
| `missing-runner` | 보드에 러너 정보가 없어요. | 보드 스냅샷을 새로 저장하세요. |
| `missing-runner-mode` | 러너의 `day`나 `night` 값이 없어요. | 보드 스냅샷을 새로 저장하세요. |
| `missing-observedAt` | 관찰 시각이 없거나 형식이 틀렸어요. | `observedAt`을 UTC(`...Z`) 형식으로 넣으세요. |
| `future-observedAt` | 관찰 시각이 지금보다 뒤예요. | 원본 컴퓨터의 시계를 확인하세요. |
| `stale` | 관찰한 지 너무 오래됐어요(기본 5분). 지금 상태로 믿으면 안 돼요. | 원본에서 상태를 새로 저장하세요. |
| `source-stale` | 원본이 스스로 오래된 값이라고 알렸어요. | 원본에서 상태를 새로 저장하세요. |
| `missing-receipt-id` | JuCeipt 영수증에 `receipt_id`가 없어요. | 영수증을 다시 만드세요. |
| `missing-acceptance` | 영수증에 `acceptance`가 없어요. | 영수증을 다시 만드세요. |
| `missing-acceptance-state` | 영수증의 `acceptance.state`가 비어 있어요. | 영수증을 다시 만드세요. |
| `missing-generated-at` | 영수증의 `generated_at`이 없거나 형식이 틀렸어요. | `generated_at`을 UTC(`...Z`) 형식으로 넣으세요. |
| `future-generated-at` | 영수증의 `generated_at`이 지금보다 뒤예요. | 영수증을 만든 컴퓨터의 시계를 확인하세요. |

New integration source belongs in `src/`, runtime/install tooling in `scripts/`,
and tests in `tests/`. [Public documentation](docs/README.md) is reviewed
separately from internal product planning, which belongs in the independent
JuControler-Private checkout.

Code repository: [ju0o/JuControler](https://github.com/ju0o/JuControler).
Owner confirmed JuControler as the product name. The local code root and GitHub
repository use the same name; the separate product SSOT is JuControler-Private.

`src/adapters/agent-relay.mjs` is a read-only adapter that projects a saved
Agent Relay `night board` JSON snapshot into `project-status.v1` entries; it
does not dispatch, run, or modify anything. Its mapping and offline usage are
documented in the [project status contract](docs/integration/PROJECT_STATUS_CONTRACT.md#source-agent-relay-board-agent-relay-board).

See the [minimal target architecture](docs/architecture.md). Repository
organization does not authorize Phase 1 implementation.
