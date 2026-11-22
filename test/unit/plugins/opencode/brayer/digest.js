import test from "node:test";
import assert from "node:assert/strict";
import { formatReadyDigest, buildReadyDigest } from "../../../../../plugins/opencode/brayer/digest.js";

const order = (overrides = {}) => ({
  id: "WO-1",
  title: "Fix the login race",
  acceptance: "npm test exits 0 with a regression test covering the race",
  priority: 80,
  ...overrides,
});

test("returns null with no ready orders", () => {
  assert.equal(formatReadyDigest([]), null);
  assert.equal(formatReadyDigest(null), null);
});

test("formats orders with id, priority, title and truncated acceptance", () => {
  const text = formatReadyDigest([order()]);
  assert.match(text, /Brayer: 1 ready work order\./);
  assert.match(text, /- WO-1 \(p80\) Fix the login race — npm test exits 0/);
});

test("caps the order count at limit and reports the remainder", () => {
  const orders = Array.from({ length: 8 }, (_, i) => order({ id: `WO-${i}` }));
  const text = formatReadyDigest(orders, { limit: 5 });
  assert.match(text, /Brayer: 8 ready work orders \(top 5 by priority\)/);
  assert.match(text, /WO-0/);
  assert.doesNotMatch(text, /WO-7 \(p/);
});

test("stays inside the budget by dropping orders", () => {
  const longAcceptance = "x".repeat(400);
  const orders = Array.from({ length: 30 }, (_, i) => order({ id: `WO-${i}`, acceptance: longAcceptance }));
  const text = formatReadyDigest(orders, { limit: 30 });
  assert.ok(text.length <= 4000 + 64, `digest too long: ${text.length}`);
  assert.match(text, /more: run brayer order ready/);
});

function fakeSpawn(responses) {
  const calls = [];
  const spawn = (bin, args, opts, cb) => {
    calls.push({ bin, args });
    const key = args.join(" ");
    const response = responses[key];
    setImmediate(() => cb(null, response === undefined ? "{}" : response));
  };
  return { spawn, calls };
}

test("skips the digest when the session already runs an attempt", async () => {
  const { spawn, calls } = fakeSpawn({
    "attempt running --session ses_1": JSON.stringify({ attempt: { id: "AT-1" } }),
  });
  const digest = await buildReadyDigest({ sessionID: "ses_1", spawn });
  assert.equal(digest, null);
  assert.equal(calls.length, 1);
});

test("builds the digest from the CLI and treats a CLI miss as none", async () => {
  const { spawn } = fakeSpawn({
    "attempt running --session ses_1": JSON.stringify({ attempt: null }),
    "order ready --limit 5": JSON.stringify({ orders: [order()] }),
  });
  const digest = await buildReadyDigest({ sessionID: "ses_1", spawn });
  assert.match(digest, /WO-1 \(p80\)/);

  const failing = (bin, args, opts, cb) => setImmediate(() => cb(new Error("enoent")));
  assert.equal(await buildReadyDigest({ sessionID: "ses_2", spawn: failing }), null);
});

test("digest can be disabled by env", async () => {
  const { spawn, calls } = fakeSpawn({});
  const digest = await buildReadyDigest({ sessionID: "ses_1", spawn, env: { BRAYER_DIGEST_DISABLE: "1" } });
  assert.equal(digest, null);
  assert.equal(calls.length, 0);
});
