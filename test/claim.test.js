import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStore } from "../src/store.js";

function withStore(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-claim-"));
  const store = createStore({ dbPath: path.join(dir, "store.sqlite") });
  try {
    return fn(store);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function ready(store, overrides = {}) {
  return store.order.create({
    title: "task",
    goal: "do the thing",
    acceptance: "the thing is done",
    status: "ready",
    ...overrides,
  });
}

test("claims a ready order once", () => withStore((store) => {
  const order = ready(store);
  const first = store.claim.claimById({ id: order.id, agentId: "claude:worker:s1" });
  assert.equal(first.claimed.status, "claimed");
  assert.equal(first.claimed.assignee, "claude:worker:s1");

  const second = store.claim.claimById({ id: order.id, agentId: "claude:worker:s2" });
  assert.equal(second.claimed, null);
  assert.equal(second.reason, "not_ready");

  const events = store.event.list({ workOrderId: order.id }).map((e) => e.kind);
  assert.deepEqual(events, ["order.created", "order.claimed"]);
}));

test("claimNext picks the highest-priority ready order", () => withStore((store) => {
  ready(store, { title: "low", priority: 10 });
  const high = ready(store, { title: "high", priority: 90 });
  const res = store.claim.claimNext({ agentId: "claude:worker:s1" });
  assert.equal(res.claimed.id, high.id);
}));

test("refuses an order assigned to another agent", () => withStore((store) => {
  const order = ready(store);
  store.db.prepare("UPDATE work_orders SET assignee='claude:other:s9' WHERE id=?").run(order.id);
  const res = store.claim.claimById({ id: order.id, agentId: "claude:worker:s1" });
  assert.equal(res.reason, "assigned_elsewhere");
}));

test("heartbeat extends the lease", () => withStore((store) => {
  const order = ready(store);
  const claimed = store.claim.claimById({ id: order.id, agentId: "claude:worker:s1", leaseSeconds: 1 }).claimed;
  const before = claimed.claimExpiresAt;
  const renewed = store.claim.heartbeat({ id: order.id, agentId: "claude:worker:s1", leaseSeconds: 60 });
  assert.ok(renewed.claimExpiresAt > before);
}));

test("sweep releases an expired lease", () => withStore((store) => {
  const order = ready(store);
  store.claim.claimById({ id: order.id, agentId: "claude:worker:s1", leaseSeconds: 0 });
  const res = store.claim.sweepExpired({ at: Date.now() + 1 });
  assert.equal(res.released, 1);
  assert.equal(store.order.get(order.id).status, "ready");
  assert.equal(store.order.get(order.id).assignee, null);
}));

test("sweep blocks after the attempt cap", () => withStore((store) => {
  const order = ready(store);
  for (let i = 0; i < 2; i++) {
    store.claim.claimById({ id: order.id, agentId: "claude:worker:s1", leaseSeconds: 0 });
    store.claim.sweepExpired({ at: Date.now() + 1 });
  }
  store.claim.claimById({ id: order.id, agentId: "claude:worker:s1", leaseSeconds: 0 });
  const res = store.claim.sweepExpired({ at: Date.now() + 2 });
  assert.equal(res.blocked, 1);
  const blocked = store.order.get(order.id);
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.attemptCount, 3);
}));

test("two stores race and only one claim wins", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-race-"));
  const dbPath = path.join(dir, "store.sqlite");
  const a = createStore({ dbPath });
  const b = createStore({ dbPath });
  try {
    const order = ready(a);
    const one = a.claim.claimById({ id: order.id, agentId: "claude:a:s1" });
    const two = b.claim.claimById({ id: order.id, agentId: "claude:b:s2" });
    assert.ok(one.claimed);
    assert.equal(two.claimed, null);
    assert.equal(two.reason, "not_ready");
  } finally {
    a.close();
    b.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
