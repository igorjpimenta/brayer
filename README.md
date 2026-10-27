# Brayer

**Ink the work, not the transcript.**

Brayer is a vendor-neutral command layer for agent work. It records a work order,
the attempts made against it, the handoff checkpoint, the evidence returned, and
the verdict — so a fleet of coding agents can be supervised by exception instead
of by transcript.

## Why Brayer

A brayer is the printer's small hand roller that applies ink evenly to type. It
does not rewrite the page, and it does not keep the manuscript. It puts the ink
exactly where the work needs it.

Brayer does the same for agents. It applies context to the work — the order, the
checkpoint, the proof, the decision — instead of piling another transcript into
the context window.

The product is a command layer, not another agent:

- **Work order in** — goal, acceptance, workspace, budget, approval mode.
- **Handoff out** — a structured checkpoint with a tree hash, not a transcript.
- **Evidence attached** — diff, tests, screenshots, artifacts, all content-addressed.
- **Verdict recorded** — approve, reject, escalate or rollback, with an audit event.
- **Resume exact** — a leased attempt can die and continue in any harness without a re-brief.

## Who it is for

Technical operators who run several coding agents across repos and harnesses and
need to supervise by exception, not by reading every trace. It is local-first and
vendor-neutral: Claude Code, Codex, OpenCode and future harnesses are adapters,
not the product.

## Status

Phase 0 (foundation) and Phase 1 (contract) are implemented. The MCP server,
SQLite store, claim lease, attempts, checkpoints, evidence, verdicts and resume
are in place. The event stream, harness adapters and packaging are next.

## What works

```sh
# MCP over stdio for one harness
BRAYER_HARNESS=claude brayer serve --mcp stdio

# Event stream for dashboards and inboxes
brayer serve --ws --port 38294

# Read the queue
brayer status
brayer status --json
```

The MCP tools are:

| Area | Tools |
| --- | --- |
| Orders | `brayer_order_create`, `brayer_order_get`, `brayer_order_next`, `brayer_order_claim`, `brayer_order_heartbeat`, `brayer_order_resume` |
| Attempts | `brayer_attempt_start`, `brayer_attempt_finish`, `brayer_attempt_get` |
| Handoff | `brayer_checkpoint_write`, `brayer_checkpoint_get` |
| Evidence | `brayer_evidence_attach`, `brayer_evidence_list` |
| Verdict | `brayer_verdict_issue`, `brayer_verdict_list` |

## Flows

```text
order created -> claimed -> attempt running -> checkpoint + evidence
             -> attempt finished -> review -> verdict -> approved / rejected / blocked
             -> resume returns the order to ready with its latest checkpoint
```

## Storage

- SQLite at `BRAYER_DB` or `~/.brayer/store.sqlite`
- Content-addressed evidence at `BRAYER_BLOBS` or `~/.brayer/blobs/<sha256>`
- Drizzle migrations in `.migrations/`, applied on open
- WAL, foreign keys and a 5s busy timeout

## Configuration

Explicit config beats `BRAYER_*` env beats defaults. Integer knobs refuse
malformed values; unknown explicit keys refuse as typos.

| Knob | Env | Default |
| --- | --- | --- |
| Store | `BRAYER_DB` | `~/.brayer/store.sqlite` |
| Blobs | `BRAYER_BLOBS` | `~/.brayer/blobs` |
| Lease | `BRAYER_LEASE_SECONDS` | `1800` |
| Attempt cap | `BRAYER_MAX_ATTEMPTS` | `3` |
| HTTP port | `BRAYER_HTTP_PORT` | `38293` |
| WS port | `BRAYER_WS_PORT` | `38294` |

## Identity

Every call is keyed `harness:agent:session`. The harness is declared at
construction (`BRAYER_HARNESS`); the agent and session are stamped per call via
`_meta.brayer` with `brayer_agent` / `brayer_session` as the fallback. Missing or
mismatched identity refuses the call.

## Development

```sh
npm install
npm test
node bin/brayer.js --help
```

## License

MIT
