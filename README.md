# brayer

Brayer is a vendor-neutral command layer for agent work. It records a work order,
the attempts made against it, the handoff checkpoint, the evidence returned, and
the verdict — so a fleet of coding agents can be supervised by exception instead
of by transcript.

## Status

Brayer is in active development. The MCP server, SQLite store, claim lease,
attempts and checkpoints are implemented.

## What works

```sh
# MCP over stdio for one harness
BRAYER_HARNESS=claude brayer serve --mcp stdio
```

The MCP tools are:

| Area | Tools |
| --- | --- |
| Orders | `brayer_order_create`, `brayer_order_get`, `brayer_order_next`, `brayer_order_claim`, `brayer_order_heartbeat` |
| Attempts | `brayer_attempt_start`, `brayer_attempt_finish`, `brayer_attempt_get` |
| Handoff | `brayer_checkpoint_write`, `brayer_checkpoint_get` |

## Flows

### Order lifecycle

An order moves from ready to review through a claim and a running attempt. A
failed attempt returns it to ready.

```mermaid
flowchart LR
  A[Order created] -->|status ready| B[Ready]
  B -->|claim| C[Claimed]
  C -->|attempt start| D[Running]
  D -->|checkpoint| D
  D -->|attempt finished| E[Review]
  D -->|attempt failed| B
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

### Checkpoint write

The store validates the attempt, state and tree hash before it records the
handoff and emits the event.

```mermaid
flowchart LR
  A[Running attempt] --> B{Belongs to order?}
  B -->|no| R[Refuse]
  B -->|yes| C{State object and tree hash?}
  C -->|no| R
  C -->|yes| D[Insert checkpoint]
  D --> E[Set attempt.checkpoint_id]
  E --> F[Emit checkpoint.written]
```

## Storage

- SQLite at `BRAYER_DB` or `~/.brayer/store.sqlite`
- Drizzle migrations in `.migrations/`, applied on open
- WAL, foreign keys and a 5s busy timeout

## Configuration

Explicit config beats `BRAYER_*` env beats defaults. Integer knobs refuse
malformed values; unknown explicit keys refuse as typos.

| Knob | Env | Default |
| --- | --- | --- |
| Store | `BRAYER_DB` | `~/.brayer/store.sqlite` |
| Lease | `BRAYER_LEASE_SECONDS` | `1800` |
| Attempt cap | `BRAYER_MAX_ATTEMPTS` | `3` |

## Identity

Every call is keyed `harness:agent:session`. The harness is declared at
construction (`BRAYER_HARNESS`); the agent and session are stamped per call via
`_meta.brayer` with `brayer_agent` / `brayer_session` as the fallback. Missing or
mismatched identity refuses the call.

## Requirements

- Node 22+
- A writable SQLite path

## Development

```sh
npm install
npm test
node bin/brayer.js --help
```

## License

MIT
