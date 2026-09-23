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

## Quickstart

Requires Node.js 22+ and bash; no install step, no network. Run from the
repository root:

```sh
bash scripts/e2e.sh
node --test tests/project-registry.test.mjs tests/status-board-cli.test.mjs
node scripts/status-board.mjs <registry.json> [--project-id <id>]
```

`scripts/e2e.sh` builds a temporary registry with one saved source per
`sourceKind` (`repository-status-file`, `juplan-status`, `juceipt-receipt`,
`agent-relay-board`), runs the status board against it, deletes the temporary
directory, and prints exactly one JSON line, for example:

```json
{"schema":"jucontroler.e2e.v1","ok":true,"projects":6,"statuses":{"repo":"READY","plan":"PLANNING","receipt":"ACCEPTED","agent-relay":"day=IDLE;night=RUNNING","lane":"RUNNING","missing":"UNKNOWN"}}
```

It exits `0` only when `ok` is `true`. For an `agent-relay-board` registry
entry, `<dataRoot>/current.json` is a saved `night board` snapshot and the
entry's `projectId` selects the runner (`agent-relay`) or the lane with that
id; a missing lane is `UNKNOWN` with reason `missing-lane`.

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
