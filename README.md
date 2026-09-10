# JuControl

One Control Tower, many agents, one runtime bridge.

JuControl is the unified product root for seeing, commanding, coordinating, and
verifying work across AI coding agents.

The target architecture combines Python Hermes orchestration, Agent Relay's
managed-work protocol, actl runtime control, and tmux transport. Existing
components remain independent projects. Target agents are Claude Code, Codex,
OpenCode, Cursor, CommandCode, Cline, and Grok.

Current status: project organization and architecture planning. This checkout
does not yet contain an implemented integration runtime or a certified E2E loop.
There are no installation or execution instructions yet.

New integration source belongs in `src/`, runtime/install tooling in `scripts/`,
and tests in `tests/`. [Public documentation](docs/README.md) is reviewed
separately from internal product planning, which belongs in the independent
JuControl-Private checkout.

Code repository: [ju0o/JuControler](https://github.com/ju0o/JuControler).
Owner confirmed this GitHub spelling. The product and local code root remain
named JuControl; the repository name is JuControler.

See the [minimal target architecture](docs/architecture.md). Repository
organization does not authorize Phase 1 implementation.
