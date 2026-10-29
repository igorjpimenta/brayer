import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { claimError, claimMessage, createWakeServer } from "../../../../../plugins/opencode/brayer/wake.js";

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
