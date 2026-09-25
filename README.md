# JuControler

> **One control plane for multiple AI-built projects and coding agents.**

JuControler is a local-first, CLI-first control plane for operating a portfolio of software projects built with AI agents.

Instead of treating every coding-agent session as an isolated chat, JuControler aims to connect projects, tasks, workers, reviewers, QA, and operational state into one bounded workflow.

## Core model

```text
Project
  → PM / planning
  → task dispatch
  → coding-agent runtime
  → independent review / QA
  → evidence-backed result
  → retry or next task
```

The important distinction is:

> **Role is not runtime.**

PM, Builder, Reviewer, and QA are responsibilities. Claude Code, Codex, OpenCode, Cursor, and other tools are execution runtimes that can potentially fill those roles through adapters.

## Goals

JuControler is designed to help with:

- multi-project visibility
- bounded task dispatch
- agent/runtime switching
- independent verification
- failure and retry handling
- resource and approval limits
- reproducible project state
- one place to see what is running, blocked, done, or waiting

## Architecture direction

JuControler coordinates existing components rather than embedding every subsystem into one monolith.

```text
                    JuControler
        portfolio · policy · orchestration
                       │
      ┌────────────────┼────────────────┐
      │                │                │
 task / result     runtime control     QA / review
      │                │                │
 Agent Relay          actl           verifiers
                       │
                    runtimes
```

Integrations are expected to remain replaceable behind clear interfaces.

## Runtime targets

Potential adapters include:

- Claude Code
- Codex
- OpenCode
- Cursor
- Cline
- CommandCode
- other CLI or desktop coding agents

A listed runtime is an integration target, not a guarantee that it is already certified.

## Product principles

- Independent evidence before accepting completion.
- Deterministic control where deterministic control is enough.
- Human approval for high-impact actions.
- Explicit limits on resources and autonomy.
- Keep runtimes interchangeable.
- Preserve project boundaries instead of collapsing everything into one agent session.

## Status

**Active development / pre-V1.**

The control-plane architecture and integration boundaries are being assembled into a usable end-to-end workflow. Public installation instructions will be added once the first reproducible V1 path is ready.

See [`docs/architecture.md`](docs/architecture.md) for the current public architecture notes.

## License

A license will be selected before the first stable public release.
