# Project status projection contract

This document defines the public, read-only status projection used to connect
JuControler to an already-stable project. It is a projection contract, not a
control API: reading status must not start, stop, mutate, or infer work in the
connected project.

## Contract

Each project exposes one snapshot with the following fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `schema` | yes | Literal contract name and version: `project-status.v1`. |
| `projectId` | yes | Stable, repository-owned project identifier. |
| `status` | yes | A source-reported status, or `UNKNOWN`. |
| `observedAt` | yes | When the source observed the status, in UTC RFC 3339. |
| `generatedAt` | yes | When this projection was generated, in UTC RFC 3339. |
| `stale` | yes | Whether the observation is older than the source freshness limit. |
| `source` | yes | Stable source identifier and kind; no credentials or private payloads. |
| `sourceRevision` | no | Source revision, release, or snapshot identifier when provided. |
| `reason` | no | Short machine-readable reason for `UNKNOWN` or `stale`; do not use it to invent a status. |

`status` is opaque to the projection layer except for `UNKNOWN`. The source
may define its own stable values, but must document them alongside its source
identifier. A consumer must preserve an unrecognized value rather than map it
to a more familiar state.

Minimal example:

```json
{
  "schema": "project-status.v1",
  "projectId": "example-project",
  "status": "READY",
  "observedAt": "2026-09-23T00:00:00Z",
  "generatedAt": "2026-09-23T00:00:03Z",
  "stale": false,
  "source": {
    "kind": "repository-status-file",
    "id": "example-project/status"
  },
  "sourceRevision": "abc123"
}
```

## Source and freshness rules

1. The source is the authority for `status`; the projection joins and relays
   source evidence. It does not derive progress, ownership, assignment,
   liveness, or completion from filenames, timestamps, process names, or UI
   labels.
2. `source.id` must identify the canonical source for the project. A source
   that cannot be identified, authenticated by the integration boundary, or
   parsed according to this schema produces `UNKNOWN`.
3. The source owner defines a freshness limit for the source kind. `stale` is
   `true` when `now - observedAt` exceeds that limit, or when the source itself
   reports that its observation is stale. Missing or invalid timestamps are
   not fresh evidence.
4. Staleness is separate from status. A last-known source status may be
   preserved with `stale: true`, but consumers must not present it as current
   or actionable. If no valid last-known status exists, emit `status:
   "UNKNOWN"` and `stale: true`.
5. A failed, empty, ambiguous, unsupported, or contradictory source read must
   not be converted into `READY`, `RUNNING`, `DONE`, `FAILED`, or any other
   positive claim. Emit `UNKNOWN` and include a bounded `reason` when useful.
6. Source data is read-only. Projection refreshes may retry reads, but must not
   write to the source, acknowledge work, dispatch commands, or repair source
   records.

## Consumer requirements

Consumers must:

- display the source and observation time with the projected status;
- make `UNKNOWN` visibly distinct from a source-reported status;
- make `stale: true` visibly distinct from a current observation;
- treat `UNKNOWN` and stale observations as non-actionable unless a separate,
  independently verified workflow authorizes an action; and
- retain the raw projection for audit/debugging without exposing credentials,
  personal identifiers, private runtime data, or agent transcripts.

Consumers must not:

- treat a missing source, stale source, or unknown status as `DOWN`, `DONE`, or
  proof that no work exists;
- infer a project-to-runtime or project-to-agent binding from a matching name;
- overwrite source status with a locally guessed value; or
- claim live execution, completion, acceptance, or release from this projection
  alone.

## Source: Agent Relay board (`agent-relay-board`)

`src/adapters/agent-relay.mjs` exports `projectAgentRelayBoard(board, options)`,
a pure function that projects one already-parsed Agent Relay `night board`
JSON snapshot into `project-status.v1` entries. It does not read files, spawn
processes, open connections, dispatch work, or write to Agent Relay; the caller
obtains the snapshot and passes it in.

It returns one entry for the runner followed by one entry per lane:

| Entry | `projectId` | `source.id` | `status` | `sourceRevision` |
| --- | --- | --- | --- | --- |
| Runner | `agent-relay` | `agent-relay/runner` | `day=<day>;night=<night>` | — |
| Lane | lane `id` | `agent-relay/lanes/<id>` | lane `state` verbatim | lane `latestVersion` |

All entries use `source.kind: "agent-relay-board"`. Status values are the
source's own and are never remapped. Runner `day`/`night` may each be a string
or `{ "state": "<value>" }`.

`reason` values:

| `reason` | `status` | When |
| --- | --- | --- |
| `missing-runner` | `UNKNOWN` | `runner` is absent. |
| `missing-runner-mode` | `UNKNOWN` | Runner `day` or `night` is missing or not text. |
| `missing-state` | `UNKNOWN` | Lane `state` is missing or empty. |
| `invalid-holds` | `UNKNOWN` | Lane `holds` is present but not an array. |
| `human-gate` | lane state | Lane `humanGate` is set (not `null`/`false`). |
| `hold` | lane state | Lane `holds` is non-empty. |
| `missing-observedAt` | as above | No valid UTC timestamp was found. |
| `future-observedAt` | as above | The timestamp is later than `now`. |
| `stale` | as above | `now - observedAt` exceeds `freshnessMs`. |

A lane or runner reason takes precedence over a staleness reason in `reason`;
`stale` is set independently. Human gates and holds are reported only as
reasons and never change the status.

Options:

- `now` (default: current time): the reference time; also used as `generatedAt`.
- `observedAt`: caller-supplied observation time. The first valid UTC
  timestamp (`YYYY-MM-DDTHH:MM:SS[.fff]Z`) among `observedAt`,
  `board.observedAt`, and `board.generatedAt` is used; otherwise `observedAt`
  falls back to `generatedAt` and every entry is `stale: true`.
- `freshnessMs` (default: `300000`, five minutes): the freshness limit.

A structurally invalid snapshot throws `AgentRelayBoardError` with a `code`
(`not-object`, `wrong-kind`, `invalid-lanes`, `invalid-runner`,
`invalid-freshness`, `invalid-lane`, `duplicate-lane`, `invalid-now`) instead
of producing entries. A lane with id `agent-relay` is rejected as a duplicate
of the runner entry.

Offline usage, from a saved snapshot:

```sh
node --input-type=module -e '
import { readFileSync } from "node:fs";
import { projectAgentRelayBoard } from "./src/adapters/agent-relay.mjs";
const board = JSON.parse(readFileSync(process.argv[1], "utf8"));
console.log(JSON.stringify(projectAgentRelayBoard(board), null, 2));
' board.json
```

## Source: JuPlan status (`juplan-status`)

`src/adapters/juplan.mjs` exports `projectJuPlanStatus(saved, options)`, a pure
function that projects one already-parsed, saved JuPlan status JSON object into
a single `project-status.v1` entry. It does not read files, spawn processes,
open connections, or write to JuPlan; the caller reads the file and passes the
parsed JSON in.

Source fields read (all others are ignored):

| Source field | Required | Projected to |
| --- | --- | --- |
| `status` | yes | `status`, verbatim (never remapped). |
| `projectId` | no | Must equal the `projectId` option when present. |
| `observedAt` | no | `observedAt` (first valid UTC timestamp wins). |
| `updatedAt` | no | `observedAt` fallback after `observedAt`. |
| `revision` | no | `sourceRevision`. |
| `stale` | no | Boolean; `true` marks the entry stale. |

The entry uses `projectId` from the option (default `juplan`) and
`source: { "kind": "juplan-status", "id": "juplan/<projectId>" }`.

Unusable source data never throws; it fails closed to `status: "UNKNOWN"`,
`stale: true`, no `sourceRevision`, and `observedAt` equal to `generatedAt`:

| `reason` | `status` | When |
| --- | --- | --- |
| `malformed` | `UNKNOWN` | The saved value is not a JSON object. |
| `project-mismatch` | `UNKNOWN` | Source `projectId` differs from the `projectId` option. |
| `invalid-stale` | `UNKNOWN` | Source `stale` is present but not a boolean. |
| `missing-status` | `UNKNOWN` | Source `status` is missing or not non-empty text. |
| `missing-observedAt` | as above | No valid UTC timestamp was found. |
| `future-observedAt` | as above | The timestamp is later than `now`. |
| `stale` | as above | `now - observedAt` exceeds `freshnessMs`. |
| `source-stale` | source status | Source `stale` is `true` and the time is otherwise fresh. |

An `UNKNOWN` reason takes precedence over a staleness reason. Options are
`projectId`, `now`, `observedAt`, and `freshnessMs` (default `300000`), with the
same meaning as for the Agent Relay board adapter; a caller-supplied
`observedAt` is checked first. Invalid options throw `JuPlanStatusError` with a
`code` (`invalid-project-id`, `invalid-freshness`, `invalid-now`).

Offline usage, from a saved status file:

```sh
node --input-type=module -e '
import { readFileSync } from "node:fs";
import { projectJuPlanStatus } from "./src/adapters/juplan.mjs";
const saved = JSON.parse(readFileSync(process.argv[1], "utf8"));
console.log(JSON.stringify(projectJuPlanStatus(saved), null, 2));
' juplan-status.json
```

This contract intentionally does not define commands, retries, source-specific
status vocabularies, or a deployment/release gate. Those belong to the owning
source or a separately reviewed integration contract.
