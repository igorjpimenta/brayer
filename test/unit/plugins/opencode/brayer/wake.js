import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { claimError, claimMessage, createWakeServer, registerWakeTarget } from "../../../../../plugins/opencode/brayer/wake.js";

const body = {
  event: "order.claimed",
  order: { id: "WO-1", title: "Fix intake", acceptance: "POST returns 200" },
  session: { sessionKey: "ses_1" },
};

function request(port, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1", port, path: "/api/brayer/claimed", method: "POST",
      headers: { "content-type": "application/json", ...headers },
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.on("error", reject);
    req.end(JSON.stringify(payload));
  });
}

test("validates claim payloads", () => {
  assert.equal(claimError(body), null);
  assert.match(claimError({ event: "other" }), /unsupported event/);
  assert.match(claimError({ event: "order.claimed", order: {}, session: body.session }), /order.id/);
  assert.match(claimError({ event: "order.claimed", order: body.order, session: {} }), /session.sessionKey/);
});

test("builds the wake message", () => {
  const text = claimMessage(body);
  assert.match(text, /WO-1/);
  assert.match(text, /Fix intake/);
  assert.match(text, /BRAYER_ORDER_ID=WO-1/);
});

test("rejects a wrong bearer", async () => {
  const s = createWakeServer({ bearer: "secret", prompt: async () => {} });
  await new Promise((resolve) => s.listen(0, "127.0.0.1", resolve));
  try {
    const res = await request(s.address().port, body, { authorization: "Bearer nope" });
    assert.equal(res.status, 401);
  } finally {
    s.close();
  }
});

test("answers the test event without waking", async () => {
  let calls = 0;
  const s = createWakeServer({ bearer: "secret", prompt: async () => { calls += 1; } });
  await new Promise((resolve) => s.listen(0, "127.0.0.1", resolve));
  try {
    const res = await request(s.address().port, { event: "webhook.test" }, { authorization: "Bearer secret" });
    assert.equal(res.status, 200);
    assert.equal(calls, 0);
  } finally {
    s.close();
  }
});

test("registers the wake URL with the daemon", async () => {
  let captured;
  const srv = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      captured = { path: req.url, auth: req.headers.authorization, body: JSON.parse(raw) };
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise((resolve) => srv.listen(0, "127.0.0.1", resolve));
  try {
    const result = await registerWakeTarget({
      registerUrl: `http://127.0.0.1:${srv.address().port}/`,
      harness: "opencode",
      url: "http://127.0.0.1:55123/api/brayer/claimed",
      bearer: "wake-secret",
      registerBearer: "reg-secret",
    });
    assert.equal(result.ok, true);
    assert.equal(captured.path, "/api/brayer/webhooks");
    assert.equal(captured.auth, "Bearer reg-secret");
    assert.deepEqual(captured.body, {
      harness: "opencode",
      url: "http://127.0.0.1:55123/api/brayer/claimed",
      bearer: "wake-secret",
    });
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});

test("retries registration while the daemon starts", async () => {
  let calls = 0;
  const srv = http.createServer((req, res) => {
    calls += 1;
    res.writeHead(calls === 1 ? 503 : 201, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: calls > 1 }));
  });
  await new Promise((resolve) => srv.listen(0, "127.0.0.1", resolve));
  try {
    const result = await registerWakeTarget({
      registerUrl: `http://127.0.0.1:${srv.address().port}`,
      url: "http://127.0.0.1:55123/api/brayer/claimed",
      attempts: 3,
      retryDelayMs: 10,
    });
    assert.equal(result.ok, true);
    assert.equal(calls, 2);
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});

test("skips registration when no daemon URL is given", async () => {
  const result = await registerWakeTarget({ url: "http://127.0.0.1:1/claimed" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "disabled");
});

test("prompts the claiming session", async () => {
  const calls = [];
  const s = createWakeServer({
    bearer: "secret",
    prompt: async (sessionKey, text) => { calls.push({ sessionKey, text }); },
  });
  await new Promise((resolve) => s.listen(0, "127.0.0.1", resolve));
  try {
    const res = await request(s.address().port, body, { authorization: "Bearer secret" });
    assert.equal(res.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].sessionKey, "ses_1");
    assert.match(calls[0].text, /WO-1/);
  } finally {
    s.close();
  }
});
