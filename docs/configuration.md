# Configuration

Explicit config beats `BRAYER_*` env beats defaults. Integer knobs refuse
malformed values; unknown explicit keys refuse as typos. Env keys unknown to
the core are ignored — the tables below list every accepted key per process.

## Core daemon (`@igorjpimenta/brayer`)

Resolved in [`src/config.js`](../src/config.js).

| Knob | Env | Default |
| --- | --- | --- |
| Store path | `BRAYER_DB` | `~/.brayer/store.sqlite` |
| Blobs path | `BRAYER_BLOBS` | `~/.brayer/blobs` |
| Claim lease | `BRAYER_LEASE_SECONDS` | `1800` |
| Attempt cap | `BRAYER_MAX_ATTEMPTS` | `3` |
| HTTP MCP port | `BRAYER_HTTP_PORT` | `39293` |
| Event stream (WS) port | `BRAYER_WS_PORT` | `39294` |
| HTTP MCP bearer | `BRAYER_MCP_BEARER` | required for HTTP MCP |
| Claim webhook URL | `BRAYER_CLAIM_WEBHOOK_URL` | unset |
| Claim webhook bearer | `BRAYER_CLAIM_WEBHOOK_BEARER` | unset |
| Claim webhook timeout | `BRAYER_CLAIM_WEBHOOK_TIMEOUT_MS` | `3000` |
| Per-harness webhook map | `BRAYER_CLAIM_WEBHOOKS` | `{}` |
| Require a checkpoint before finish | `BRAYER_REQUIRE_CHECKPOINT` | `false` |
| Require usage before finish | `BRAYER_REQUIRE_USAGE` | `false` |

The claim webhook entries double as the claim gate: a harness without any of
these routes (DB row, per-harness entry, or global URL) cannot claim orders,
because a claimed order nobody could be woken for would be invisible
([lifecycle](lifecycle.md#identity-refusal-contract)).

Harness-side identity knobs:

| Knob | Applies to | Notes |
| --- | --- | --- |
| `BRAYER_HARNESS` | stdio MCP and the event stream | required for stdio; must not cross into HTTP minting |
| `BRAYER_AGENT` | OpenCode adapter | fallback when the session agent cannot be captured |

The OpenClaw adapter reads no transport environment: its transport config
lives in `openclaw.json` (`mcp.servers.brayer.headers`, incl.
`X-Brayer-Harness`), and its claim webhook route is registered in the store via
`brayer webhook set` rather than an env ([webhooks](webhooks.md)). The session
hooks above are its only envs.

Package shape differs by design: the OpenClaw adapter opens the store directly
from the core daemon's code, so `@igorjpimenta/brayer` is a declared
dependency of `@igorjpimenta/brayer-openclaw`; the OpenCode adapter is
standalone (`@igorjpimenta/brayer-opencode` carries its own stamping code and
nothing from the core package).

Flags on `brayer serve` override ports per launch: `--mcp http --port N`,
`--host H`, `--ws --port N`.

## Wake bridge (`@igorjpimenta/brayer-opencode`)

Read by the wake bridge inside the OpenCode plugin process
([`plugins/opencode/brayer/wake.js`](../plugins/opencode/brayer/wake.js)), not
by the core daemon.

| Env | Default | Notes |
| --- | --- | --- |
| `BRAYER_WAKE_BEARER` | required | bearer checked on every wake request |
| `BRAYER_OPENCODE_URL` | `http://127.0.0.1:4096` | OpenCode SDK base URL |
| `BRAYER_WAKE_PORT` | `0` | ephemeral listen port; `--port N` pins one |
| `BRAYER_WAKE_HARNESS` | `opencode` | harness registered with the daemon |
| `BRAYER_REGISTER_URL` | `http://127.0.0.1:${BRAYER_HTTP_PORT??39293}` | daemon base URL for self-registration |

The bridge binds an ephemeral port, then POSTs the actual URL to the daemon at
`/api/brayer/webhooks`; the daemon upserts it as the harness's claim target.
Registration retries briefly while the daemon starts. Set
`BRAYER_REGISTER_URL` when the MCP daemon is not on the default `39293`. If
registration still fails the bridge keeps serving and logs the manual
`brayer webhook set` command. Pin `BRAYER_WAKE_PORT` only when an ephemeral
port cannot be used. Self-registration needs the HTTP MCP daemon
(`brayer serve --mcp http`) and is accepted from loopback only; stdio or
off-loopback deployments keep using the manual `brayer webhook set` path.

## Session hooks (`@igorjpimenta/brayer-opencode`)

Read inside the OpenCode server process ([`setup.js`](../plugins/opencode/brayer/setup.js),
[`hooks.js`](../plugins/opencode/brayer/hooks.js)) and by the CLI commands the
plugin spawns (`brayer order ready`, `brayer attempt running`,
`brayer checkpoint write`).

| Env | Default | Notes |
| --- | --- | --- |
| `BRAYER_BIN` | `brayer` | CLI binary the plugin spawns |
| `BRAYER_READY_LIMIT` | `5` | max orders shown in the session-start digest |
| `BRAYER_DIGEST_DISABLE` | unset | `1` disables the ready-work digest |
| `BRAYER_CAPTURE_DISABLE` | unset | `1` disables idle auto-checkpoints |
| `BRAYER_CAPTURE_MIN_MS` | `300000` | min interval between auto-checkpoints per session |

Behavior:

- the first model request of a session gets one bounded ready-order digest
  injected into the system instructions (≤5 orders, ≤4000 chars, silent
  failure); a session that already runs an attempt is skipped;
- on `session.idle`, sessions that touched a brayer tool write one auto
  checkpoint (`kind: auto`) through `brayer checkpoint write --session`, which
  resolves the running attempt from the session ref; throttled per session.
  These checkpoints are what `requireCheckpoint` counts, so the knob can be
  enabled once the plugin is deployed.

## Session hooks (`@igorjpimenta/brayer-openclaw`)

Read inside the OpenClaw gateway process
([`index.js`](../plugins/openclaw/brayer/index.js),
[`digest.js`](../plugins/openclaw/brayer/digest.js),
[`capture.js`](../plugins/openclaw/brayer/capture.js)). The gateway opens the
store directly, so no CLI spawn is involved. The same env names apply:
`BRAYER_READY_LIMIT`, `BRAYER_DIGEST_DISABLE`, `BRAYER_CAPTURE_DISABLE`,
`BRAYER_CAPTURE_MIN_MS`.

Two modes:

- **Configured order** (`orderId` set, `autoCheckpoint` not false) — the
  pre-existing flow: claim/resume the configured order, checkpoint on
  `agent_end`/`session_end`, resume context on `before_prompt_build`.
- **General gateway** (no `orderId`, or `autoCheckpoint: false`) — the
  proactive flow: the first prompt of a session gets the same bounded
  ready-order digest (via `prependContext`), and `agent_end`/`session_end`
  write one throttled auto checkpoint per session that touched a brayer tool
  and has a running attempt, resolved from the session ref.
