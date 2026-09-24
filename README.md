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
{"schema":"jucontroler.e2e.v1","ok":true,"steps":[{"name":"build-registry","ok":true},{"name":"run-status-board","ok":true},{"name":"check-projections","ok":true},{"name":"run-project-id","ok":true}],"ms":1744,"projects":6,"statuses":{"repo":"READY","plan":"PLANNING","receipt":"ACCEPTED","agent-relay":"day=IDLE;night=RUNNING","lane":"RUNNING","missing":"UNKNOWN"}}
```

읽는 법:

- `ok` — 모든 단계가 통과하면 `true`입니다. 이때만 종료 코드가 `0`입니다.
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
