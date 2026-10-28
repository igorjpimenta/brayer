import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStore } from "../../../src/store.js";
import { claimPayload, notifyClaim, webhookConfig } from "../../../src/claim-webhook.js";

function server(handler) {
  return new Promise((resolve) => {
    const s = http.createServer(handler);
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
}

test("resolves db, per-harness and single webhook targets in order", () => {
  const cfg = {
    claimWebhookUrl: "http://single.example/hook",
    claimWebhookBearer: "single",
    claimWebhookTimeoutMs: 1500,
    claimWebhooks: { opencode: { url: "http://per.example/hook", bearer: "per" } },
  };
  assert.deepEqual(webhookConfig(cfg, "opencode", { url: "http://db.example/hook", bearer: "db" }), {
    url: "http://db.example/hook",
    bearer: "db",
    timeoutMs: 1500,
  });
  assert.deepEqual(webhookConfig(cfg, "opencode"), {
    url: "http://per.example/hook",
    bearer: "per",
    timeoutMs: 1500,
  });
  assert.deepEqual(webhookConfig(cfg, "other"), {
    url: "http://single.example/hook",
    bearer: "single",
    timeoutMs: 1500,
  });
  assert.equal(webhookConfig({ claimWebhookUrl: "" }), null);
});

test("builds the claim payload with the caller identity", () => {
  const payload = claimPayload({
    order: { id: "WO-1" },
    agentId: "opencode:scout:ses-1",
    sessionRef: "ses-1",
    at: 42,
  });
  assert.equal(payload.event, "order.claimed");
  assert.equal(payload.at, 42);
  assert.deepEqual(payload.session, { harness: "opencode", agent: "scout", sessionKey: "ses-1" });
});

test("posts the payload with the bearer", async () => {
  let request = null;
  const s = await server((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      request = { headers: req.headers, body: JSON.parse(body) };
      res.writeHead(200);
      res.end("{}");
    });
  });
  try {
    const cfg = {
      claimWebhookUrl: `http://127.0.0.1:${s.address().port}/hook`,
      claimWebhookBearer: "secret",
      claimWebhookTimeoutMs: 2000,
    };
    const result = await notifyClaim(cfg, { event: "webhook.test" });
    assert.deepEqual(result, { ok: true, status: 200 });
    assert.equal(request.headers.authorization, "Bearer secret");
    assert.deepEqual(request.body, { event: "webhook.test" });
  } finally {
    s.close();
  }
});

test("claiming a ready order posts once", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-webhook-"));
  let resolveBody;
  const received = new Promise((resolve) => { resolveBody = resolve; });
  const s = await server((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      resolveBody(JSON.parse(body));
      res.writeHead(200);
      res.end("{}");
    });
  });
  const store = createStore({
    dbPath: path.join(dir, "store.sqlite"),
    config: { claimWebhookUrl: `http://127.0.0.1:${s.address().port}/hook` },
  });
  try {
    const order = store.order.create({ title: "t", goal: "g", acceptance: "a", status: "ready" });
    const claimed = store.claim.claimById({ id: order.id, agentId: "opencode:scout:ses-1", sessionRef: "ses-1" });
    assert.equal(claimed.claimed.status, "claimed");
    const body = await received;
    assert.equal(body.event, "order.claimed");
    assert.equal(body.order.id, order.id);
    assert.deepEqual(body.session, { harness: "opencode", agent: "scout", sessionKey: "ses-1" });
  } finally {
    store.close();
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
