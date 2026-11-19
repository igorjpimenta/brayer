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
| HTTP MCP port | `BRAYER_HTTP_PORT` | `38293` |
| Event stream (WS) port | `BRAYER_WS_PORT` | `38294` |
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

The OpenClaw adapter reads no environment: its transport config lives in
`openclaw.json` (`mcp.servers.brayer.headers`, incl.
`X-Brayer-Harness`), and its claim webhook route is registered in the store via
`brayer webhook set` rather than an env ([webhooks](webhooks.md)).

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
| `BRAYER_WAKE_PORT` | `38296` | listen port; `brayer-wake --port N` overrides |

The wake bridge must not share the MCP server's port. On a single-host setup
the MCP daemon often occupies `38293` or `38295`; `38296` keeps the bridge
separate.
