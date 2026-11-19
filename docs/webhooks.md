# Webhooks and wake bridge

Brayer notifies other processes when a claim happens.

## Claim webhooks (core daemon)

On every successful claim the daemon POSTs `{ event: "order.claimed", … }` to a
configured target ([`src/claim-webhook.js`](../src/claim-webhook.js)). Targets
resolve per call as: per-claim DB entry → per-harness entry
(`BRAYER_CLAIM_WEBHOOKS` JSON map) → global `BRAYER_CLAIM_WEBHOOK_URL`. Each
entry carries its own bearer and timeout (default 3000 ms).

Register from the CLI:

```sh
brayer webhook set --harness opencode \
  --url http://127.0.0.1:38296/api/brayer/claimed --bearer secret
brayer webhook test --harness opencode
```

The OpenClaw adapter exposes its receiver at `POST /api/brayer/claimed` **on
the gateway's own HTTP server** — OpenClaw needs no external bridge, because
the plugin validates the bearer and wakes the claiming agent immediately via
`workflow.scheduleSessionTurn` (a one-shot `brayer-claim-<order-id>` turn,
deleted after run). OpenCode, a stateless CLI, cannot accept webhooks directly
— that is what the wake bridge below exists for.

## Wake bridge (`brayer-wake`)

The OpenCode package ships an optional `brayer-wake` bin. It runs a small HTTP
server (default port `38296`) that receives the claim webhook and prompts the
claiming OpenCode session through the OpenCode SDK.

```sh
BRAYER_WAKE_BEARER=$(openssl rand -hex 32) \
  brayer-wake
```

Contract:

- every request must carry the `BRAYER_WAKE_BEARER` — otherwise the bridge
  answers `503 wake not configured` or refuses the bearer;
- the claimed payload must be an `order.claimed` event — anything else is
  rejected with the reason;
- the resulting prompt instructs the session to attach with the given order id
  and report through the Brayer tools.

Envs: `BRAYER_WAKE_BEARER` (required), `BRAYER_OPENCODE_URL` (default
`http://127.0.0.1:4096`), and `BRAYER_WAKE_PORT` (default `38296`;
`brayer-wake --port N` overrides). Keep it off the MCP daemon's port. See
[configuration](configuration.md#wake-bridge-igorjpimentabrayer-opencode).
