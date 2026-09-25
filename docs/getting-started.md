# 처음 쓰는 법 — 자세히

[README](../README.md)의 `빠른 시작 (처음 쓰는 법)`에서 옮겨 온 자세한 설명입니다.

## `bash scripts/e2e.sh` 결과 읽는 법

임시 폴더에 연습용 프로젝트 목록(registry)을 만들고, 상태판을 돌려 보고,
결과를 확인한 뒤 임시 폴더를 지웁니다. 인터넷을 쓰지 않고 아무것도 바꾸지
않습니다. JSON 한 줄만 출력합니다. 예시:

```json
{"schema":"jucontroler.e2e.v1","ok":true,"message":"모두 정상이에요","steps":[{"name":"build-registry","ok":true},{"name":"run-status-board","ok":true},{"name":"check-projections","ok":true},{"name":"run-project-id","ok":true},{"name":"run-needs-action","ok":true}],"ms":1744,"projects":6,"statuses":{"repo":"READY","plan":"PLANNING","receipt":"ACCEPTED","agent-relay":"day=IDLE;night=RUNNING","lane":"RUNNING","missing":"UNKNOWN"}}
```

- `ok` — 모든 단계가 통과하면 `true`입니다. 이때만 종료 코드가 `0`입니다.
- `message` — 결과를 쉬운 한국어 한 문장으로 알려 줍니다. 정상이면 `모두 정상이에요`,
  실패하면 처음 멈춘 단계를 알려 줍니다(예: `상태판 실행 단계에서 멈췄어요 — next의
  명령을 직접 실행해 보세요`).
- `next` — 실패했을 때만 나옵니다. `build-registry`·`check-projections`는
  `node --test tests/*.test.mjs`, `run-status-board`·`run-project-id`·`run-needs-action`는
  `node scripts/status-board.mjs <registry.json>`입니다.
- `steps` — 단계별 결과입니다. 하나가 실패하면 그 뒤 단계는 실행하지 않고
  `ok: false`로 적습니다.
  - `build-registry`: 연습용 프로젝트 목록 만들기
  - `run-status-board`: 상태판 실행
  - `check-projections`: 여섯 프로젝트의 상태가 예상과 같은지 확인
  - `run-project-id`: `--project-id lane`으로 프로젝트 하나만 조회
  - `run-needs-action`: 보류 중인 레인 `held` 하나만 있는 목록으로 상태판을 돌려
    `확인이 필요한 프로젝트` 안내 줄이 나오는지 확인
- `ms` — 전체 실행 시간(밀리초)입니다. 실행할 때마다 조금씩 다릅니다.
- `projects`, `statuses` — 상태판에 나온 프로젝트 수와 각 상태입니다.

## 프로젝트 목록(`registry.json`) 규칙

- 항목 칸은 `projectId`, `workspaceRoot`, `dataRoot`, `sourceRef`(필수)와
  `sourceKind`, `freshnessMs`(선택)뿐입니다. 다른 칸을 넣으면 오류가 납니다.
- `workspaceRoot`, `dataRoot`는 `/`로 시작하는 절대 경로여야 합니다.
- `sourceKind`는 빼면 `repository-status-file`이고, 넣으려면 아래 네 종류 중
  하나만 씁니다.
- 상태 파일은 각 항목의 `dataRoot` 폴더 바로 안(`<dataRoot>/current.json`)에 둡니다.
- `freshnessMs`는 0 이상의 숫자입니다. 이보다 오래된 관찰은 `stale`로 표시합니다
  (기본 5분).
- `UNKNOWN`은 그 파일이 없거나 읽을 수 없어서 상태를 알 수 없다는 뜻입니다.

| `sourceKind` | 읽는 것 |
| --- | --- |
| `repository-status-file` | 저장소가 직접 남긴 `project-status.v1` 파일 |
| `juplan-status` | JuPlan이 저장한 상태 |
| `juceipt-receipt` | JuCeipt 영수증의 `acceptance.state` |
| `agent-relay-board` | 저장된 Agent Relay `night board` 스냅샷 |

`agent-relay-board` 항목은 `projectId`가 `agent-relay`이면 러너(`day=…;night=…`)를,
그 밖이면 같은 id의 레인을 보여 줍니다. 없는 레인은 `UNKNOWN`(이유 `missing-lane`)으로
나옵니다. 네 원본의 정확한 변환 규칙은
[project status contract](integration/PROJECT_STATUS_CONTRACT.md)에 있습니다.

## 약속(계약) 파일

`node --test tests/*.test.mjs`는 아래 파일의 모양도 확인합니다. 모두 규칙을
적어 둔 파일일 뿐이고, 무언가를 실행하거나 설치하거나 바꾸지 않습니다.

| 파일 | 담긴 규칙 |
| --- | --- |
| `integration/ai-assignment.v1.json` | AI 자동 배정: 역할(PM·Worker·QA·Tester)마다 구독 AI 먼저, 무료 모델은 보조 |
| `integration/skill-attachment.v1.json` | 프로젝트×역할별 Skill 장착 |
| `integration/approved-memory.v1.json` | 승인한 기억은 모든 역할에게, QA가 배운 점은 제안만 |
| `integration/create-skill-registry.v1.json` | 에이전트별 스킬 만들기 스킬과 읽기 전용 권한 |
| `integration/tester-harness.schema.json` | Tester 역할: 읽기 전용, 네트워크 없음, 판정 권한 없음, QA와 별개 |
| `integration/project-status.schema.json` | 상태판 한 줄(`project-status.v1`) 모양 |

## 상태판 안내 문장 읽는 법

`node scripts/status-board.mjs <registry.json>`은 상태판 JSON 말고도 stderr에
한국어 안내 한 줄을 적습니다. `<...>` 자리에는 실제 값이 들어갑니다.

| 안내 문장 | 다음에 할 일 |
| --- | --- |
| `프로젝트 <N>개 모두 상태를 읽었어요` | 할 일 없음. 상태판 JSON을 보면 됩니다. |
| `프로젝트 <N>개 중 <M>개는 상태를 알 수 없어요: <ID>(<reason>: <뜻>), … — README 처음 쓰는 법의 reason 표를 보세요` | 괄호 속 뜻을 보고 그 프로젝트의 상태 파일(`<dataRoot>/current.json`)을 고칩니다. |
| `확인이 필요한 프로젝트: <ID>(<reason>: <뜻>), … — 해당 레인의 확인 요청이나 보류를 처리하세요` | 위 줄 아래에 한 줄 더 나옵니다(human-gate·hold). 그 레인의 확인 요청이나 보류를 처리합니다. |
| `목록에 프로젝트가 없어요 — registry.json의 projects에 항목을 넣으세요 (README 처음 쓰는 법 예시 참고)` | `projects`에 항목을 하나 이상 넣습니다. |
| `프로젝트 목록 파일을 열 수 없어요 — 경로를 확인하세요` | 명령에 적은 파일 경로가 맞는지 확인합니다. |
| `프로젝트 목록 파일이 올바른 JSON이 아니에요 — 쉼표·따옴표·괄호를 확인하세요` | 파일의 쉼표·따옴표·괄호를 고칩니다. |
| `프로젝트 목록 파일 내용이 올바르지 않아요 — <고칠 곳>` | `—` 뒤에 적힌 곳을 위 [규칙](#프로젝트-목록registryjson-규칙)대로 고칩니다. |
| `그런 프로젝트 ID가 목록에 없어요 — --project-id 값을 확인하세요 (목록에 있는 ID: <ID>, …)` | 괄호 속 ID 중 하나로 `--project-id`를 다시 적습니다. 목록이 비었으면 `없음`으로 나옵니다. |
| `사용법: node scripts/status-board.mjs <프로젝트 목록 파일.json> [--project-id <프로젝트 ID>]` | 명령을 이 모양대로 다시 적습니다. 아래에 영어 `Usage: …` 줄이 하나 더 나오고, 종료 코드는 `2`입니다. |

아래 네 가지 오류(열 수 없음, JSON 아님, 내용 오류, 없는 ID)는 한국어 줄 바로
아래에 영어 줄(예: `Unable to read project registry: …`, `Unknown projectId: …`)이
하나 더 나옵니다. 개발자가 원인을 찾을 때 쓰려고 남겨 둔 원문이라, 한국어 줄만
보고 고쳐도 됩니다. 이때 종료 코드는 `1`입니다.

## 개발자용

- 연동 코드는 `src/`, 실행 도구는 `scripts/`, 테스트는 `tests/`에 둡니다.
- `src/adapters/`의 `agent-relay.mjs`, `juplan.mjs`, `juceipt.mjs`는 저장된
  JSON을 `project-status.v1`로 바꾸기만 하는 읽기 전용 어댑터입니다. 작업을
  보내거나 실행하거나 바꾸지 않습니다.
- 목표 구조는 [architecture](architecture.md)에 있습니다. 이 문서는 목표이지
  이미 구현됐다는 뜻이 아닙니다.
- 공개 문서 규칙은 [docs/README](README.md)를 보세요.
