import test from "node:test";
import assert from "node:assert/strict";
import { claimError, claimMessage, claimSessionKey } from "../../../../../plugins/openclaw/brayer/webhook.js";

const body = {
  event: "order.claimed",
  order: { id: "WO-1", title: "Fix intake", acceptance: "POST returns 200" },
  session: { agent: "scout", sessionKey: "openclaw:scout:s1" },
};

test("accepts a claim payload", () => {
  assert.equal(claimError(body), null);
  assert.equal(claimError({ event: "webhook.test" }), null);
});

test("rejects malformed payloads", () => {
  assert.match(claimError({ event: "other" }), /unsupported event/);
  assert.match(claimError({ event: "order.claimed", order: {}, session: body.session }), /order.id/);
  assert.match(claimError({ event: "order.claimed", order: body.order, session: {} }), /session.agent/);
});

test("names the wake session and message", () => {
  assert.equal(claimSessionKey("WO-1"), "brayer-claim-WO-1");
  const text = claimMessage(body);
  assert.match(text, /WO-1/);
  assert.match(text, /Fix intake/);
  assert.match(text, /POST returns 200/);
  assert.match(text, /BRAYER_ORDER_ID=WO-1/);
});
