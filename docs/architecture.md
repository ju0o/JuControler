# JuControl target architecture

One Control Tower, many agents, one runtime bridge.

```text
Managed work:
Control Tower -> Python Hermes -> Agent Relay -> actl -> tmux -> Agent

Direct human control:
Control Tower -> actl -> tmux -> Agent
```

Python Hermes owns orchestration decisions. Agent Relay owns durable managed
work, results, verification and judgments. actl controls agent runtimes; tmux
provides terminal transport. Control Tower presents the unified human interface.
Direct control can operate without creating a managed Task.

Target agents are Claude Code, Codex, OpenCode, Cursor, CommandCode, Cline and
Grok. These are integration targets, not a claim of certified runtime support.

Existing components remain independent projects. JuControl contains the new
integration layer; it does not vendor or merge their source repositories.

This is a planning skeleton. No integration runtime, GUI framework, new Task
engine, message broker or daemon has been implemented here.
