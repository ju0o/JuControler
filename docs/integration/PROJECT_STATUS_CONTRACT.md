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

This contract intentionally does not define commands, retries, source-specific
status vocabularies, or a deployment/release gate. Those belong to the owning
source or a separately reviewed integration contract.
