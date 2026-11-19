# Webhooks and wake bridge

Brayer notifies other processes when a claim happens.

## Claim webhooks (core daemon)

On every successful claim the daemon POSTs `{ event: "order.claimed", … }` to a
configured target ([`src/claim-webhook.js`](../src/claim-webhook.js)). Targets
resolve per call as: per-claim DB entry → per-harness entry
(`BRAYER_CLAIM_WEBHOOKS` JSON map) → global `BRAYER_CLAIM_WEBHOOK_URL`. Each
entry carries its own bearer and timeout (default 3000 ms).

The `brayer-wake` bridge registers itself (below). For a fixed target or a
different receiver, register manually:

```sh
brayer webhook set --harness opencode \
  --url http://127.0.0.1:<port>/api/brayer/claimed --bearer secret
brayer webhook test --harness opencode
```

The OpenClaw adapter exposes its receiver at `POST /api/brayer/claimed` **on
the gateway's own HTTP server** — OpenClaw needs no external bridge, because
the plugin validates the bearer and wakes the claiming agent immediately via
`workflow.scheduleSessionTurn` (a one-shot `brayer-claim-<order-id>` turn,
deleted after run). OpenCode, a stateless CLI, cannot accept webhooks directly
— that is what the wake bridge below exists for.

## Wake bridge (`brayer-wake`)

The OpenCode package ships an optional `brayer-wake` bin. It binds an
ephemeral loopback port (default `0`), registers the resulting URL with the
daemon, and prompts the claiming OpenCode session through the OpenCode SDK.

```sh
BRAYER_WAKE_BEARER=$(openssl rand -hex 32) \
  brayer-wake
# brayer wake: listening on http://127.0.0.1:53621/api/brayer/claimed
# brayer wake: registered opencode at http://127.0.0.1:53621/api/brayer/claimed
```

If the daemon is not on the default `38293`:

```sh
BRAYER_REGISTER_URL=http://127.0.0.1:38295 \
BRAYER_WAKE_BEARER=... brayer-wake
```

Self-registration requires the HTTP MCP daemon; with stdio, register the
printed URL manually.

Contract:

- every request must carry the `BRAYER_WAKE_BEARER` — otherwise the bridge
  answers `503 wake not configured` or refuses the bearer;
- the claimed payload must be an `order.claimed` event — anything else is
  rejected with the reason;
- the resulting prompt instructs the session to attach with the given order id
  and report through the Brayer tools;
- self-registration POSTs `{ harness, url, bearer }` to
  `/api/brayer/webhooks`. The endpoint is loopback-only unless the daemon sets
  `BRAYER_REGISTER_BEARER`; in that case the bridge must send the same value;
- registration retries briefly while the daemon starts; if it still fails the
  bridge logs the actual URL and the manual `brayer webhook set` command, and
  keeps serving.

Envs: `BRAYER_WAKE_BEARER` (required), `BRAYER_OPENCODE_URL` (default
`http://127.0.0.1:4096`), `BRAYER_WAKE_PORT` (default `0`, ephemeral;
`brayer-wake --port N` pins), `BRAYER_WAKE_HARNESS` (default `opencode`),
`BRAYER_REGISTER_URL` (default `http://127.0.0.1:38293`), and
`BRAYER_REGISTER_BEARER` (optional). See
[configuration](configuration.md#wake-bridge-igorjpimentabrayer-opencode).
