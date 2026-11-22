import test from "node:test";
import assert from "node:assert/strict";
import { withStore } from "../../../../helpers/store.js";
import { readyOrder, runningAttempt } from "../../../../helpers/fixtures.js";
import { readyDigest } from "../../../../../plugins/openclaw/brayer/digest.js";

test("formats ready orders from the store", () => withStore((store) => {
  readyOrder(store, { title: "Fix the race", acceptance: "tests green", priority: 90 });
  const text = readyDigest({ store });
  assert.match(text, /Brayer: 1 ready work order\./);
  assert.match(text, /- WO-.* \(p90\) Fix the race — tests green/);
}));

test("returns null with no ready orders and without a store", () => withStore((store) => {
  assert.equal(readyDigest({ store }), null);
  assert.equal(readyDigest({ store: null }), null);
}));

test("skips a session that already runs an attempt", () => withStore((store) => {
  readyOrder(store, { title: "work" });
  runningAttempt(store);
  assert.match(readyDigest({ store }), /work/);
  assert.equal(readyDigest({ store, session: "s1" }), null);
}));

test("respects --limit and the disable env", () => withStore((store) => {
  readyOrder(store, { title: "t0", priority: 10 });
  readyOrder(store, { title: "t1", priority: 20 });
  readyOrder(store, { title: "t2", priority: 30 });
  readyOrder(store, { title: "t3", priority: 40 });
  const text = readyDigest({ store, limit: 2 });
  assert.match(text, /Brayer: 2 ready work orders\./);
  assert.match(text, /\(p40\) t3/);
  assert.match(text, /\(p30\) t2/);
  assert.doesNotMatch(text, /\(p20\) t1/);
  assert.doesNotMatch(text, /\(p10\) t0/);

  const none = readyDigest({ store, env: { BRAYER_DIGEST_DISABLE: "1" } });
  assert.equal(none, null);
}));
