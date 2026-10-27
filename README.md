# brayer

Brayer is a vendor-neutral command layer for agent work. It records a work order,
the attempts made against it, the handoff checkpoint, the evidence returned, and
the verdict — so a fleet of coding agents can be supervised by exception instead
of by transcript.

## Status

Brayer is in active development. The MCP server, SQLite store, claim lease,
attempts, checkpoints, evidence, verdicts, resume and event stream are
implemented.

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

## Flows

### Order lifecycle

An order moves from ready through a claim and a running attempt to review. The
verdict decides where it lands, and resume returns rejected or blocked work to
ready.

```mermaid
flowchart LR
  A[Order created] -->|status ready| B[Ready]
  B -->|claim| C[Claimed]
  C -->|attempt start| D[Running]
  D -->|checkpoint / evidence| D
  D -->|attempt finished| E[Review]
  D -->|attempt failed| B
  E -->|approve| F[Approved]
  E -->|reject| G[Rejected]
  E -->|escalate| H[Blocked]
  G -->|resume| B
  H -->|resume| B
```

### Claim and lease

An agent claims a ready order, then keeps the lease alive with heartbeats. An
expired lease returns to the queue or blocks at the attempt cap.

```mermaid
flowchart LR
  Q[Ready order] -->|claimNext / claimById| L{Lease won?}
  L -->|no| Q
  L -->|yes| H[Claimed with lease]
  H -->|heartbeat| H
  H -->|lease expired| E{Attempt cap?}
  E -->|no| Q
  E -->|yes| X[Blocked]
```

### Checkpoint and evidence

The store validates the attempt and the handoff or proof before it records the
row and emits the event.

```mermaid
flowchart LR
  A[Running attempt] --> B{Belongs to order?}
  B -->|no| R[Refuse]
  B -->|yes| C{Valid state / tree hash / sha256?}
  C -->|no| R
  C -->|yes| D[Insert checkpoint or evidence]
  D --> E[Emit event]
```

### Verdict and resume

A verdict closes review or blocked work. Reject and escalate remain resumable;
rollback returns the order to ready directly.

```mermaid
flowchart LR
  A[Review or blocked] --> B{Decision}
  B -->|approve| C[Approved]
  B -->|reject| D[Rejected]
  B -->|escalate| E[Blocked]
  B -->|rollback| F[Ready]
  D -->|resume| F
  E -->|resume| F
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
