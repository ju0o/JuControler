# JuControler target architecture

**Current direction (VNext, 2026-09-13).** For the earlier certified
architecture this supersedes, see the historical documents linked at the
bottom of this page — that work's evidence carries forward; its choice of a
single required orchestration-brain process does not.

One CLI to operate a portfolio of AI-built software projects.

```text
jucontroler CLI
  -> Project Registry / state projection
  -> PM Harness (bounded, event-triggered — not a permanent process)
  -> Role/Skill Router
  -> RuntimeAdapter (actl: runtime identity, reservation, send/collect, tmux transport)
  -> Agent (Claude Code, Codex, OpenCode, Cursor, CommandCode, Cline, Grok)
  -> Result -> Evidence -> independent Verification
  -> PASS / CHANGES / OWNER_REQUIRED
  -> PM Harness -> automatic NEXT or Human Gate
```

Role is not Runtime: PM/Builder/Reviewer/QA are Harnesses, not permanent
personas: a Harness is instantiated only when an event requires that role and
released after. Agent Relay owns durable managed work, results, verification
and PM judgments during V0; actl controls agent runtimes; tmux provides
terminal transport. Existing components remain independent projects that
JuControler adapts rather than vendors or merges.

Target agents are Claude Code, Codex, OpenCode, Cursor, CommandCode, Cline and
Grok. These are integration targets, not a claim of certified runtime
support — see the historical documents below for what has actually been
certified end-to-end so far (Codex only, as of 2026-09-13).

**Current status: V0 NOT CERTIFIED.** No integration runtime, GUI framework,
new Task engine, message broker or daemon has been implemented here yet.

## Historical architecture (superseded, preserved as provenance)

- [CONTROL_TOWER_INTEGRATION_REBASELINE.md](CONTROL_TOWER_INTEGRATION_REBASELINE.md) — GATE 1
- [CONTROL_TOWER_TARGET_ARCHITECTURE.md](CONTROL_TOWER_TARGET_ARCHITECTURE.md) — GATE 2, D1–D10

These certified a working Relay↔actl↔tmux↔Codex managed-Task loop end-to-end
(runtime identity, writer reservation, result correlation, independent
verification, reboot/runtime-loss recovery). Their original text is preserved
unchanged as historical record; do not read their status headers as current.
