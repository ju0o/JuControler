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
current direction. There are no installation or execution instructions yet.

New integration source belongs in `src/`, runtime/install tooling in `scripts/`,
and tests in `tests/`. [Public documentation](docs/README.md) is reviewed
separately from internal product planning, which belongs in the independent
JuControler-Private checkout.

Code repository: [ju0o/JuControler](https://github.com/ju0o/JuControler).
Owner confirmed JuControler as the product name. The local code root and GitHub
repository use the same name; the separate product SSOT is JuControler-Private.

See the [minimal target architecture](docs/architecture.md). Repository
organization does not authorize Phase 1 implementation.
