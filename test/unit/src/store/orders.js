import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createStore } from "../../../../src/store.js";
import { withStore, withTempDir } from "../../../helpers/store.js";

test("creates and reads an order", () => withStore((store) => {
  const order = store.order.create({
    title: "Fix intake 500",
    goal: "The intake endpoint returns 200 for a valid job description",
    acceptance: "POST /api/intake returns 200 and the row is persisted",
    workspace: "/tmp/repo",
    repo: "igorpimenta/portal",
    branch: "fix/intake",
    approvalMode: "evidence",
  });

  assert.match(order.id, /^WO-/);
  assert.equal(order.status, "draft");
  assert.equal(order.acceptance, "POST /api/intake returns 200 and the row is persisted");
  assert.equal(store.order.get(order.id).title, "Fix intake 500");
  assert.equal(store.order.list().length, 1);
}));

test("writes order.created in the same transaction", () => withStore((store) => {
  const order = store.order.create({
    title: "Resume session",
    goal: "A killed session can resume",
    acceptance: "The resumed attempt reads the checkpoint",
  });

  const events = store.event.list({ workOrderId: order.id });
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "order.created");
  assert.equal(events[0].toStatus, "draft");
  assert.equal(events[0].workOrderId, order.id);
}));

test("refuses an order without acceptance", () => withStore((store) => {
  assert.throws(() => store.order.create({ title: "x", goal: "y", acceptance: "  " }), /acceptance is required/);
}));

test("refuses an unknown status", () => withStore((store) => {
  assert.throws(() => store.order.create({
    title: "x", goal: "y", acceptance: "z", status: "shipped",
  }), /invalid order status/);
}));

test("persists orders across a reopen", () => withTempDir((dir) => {
  const dbPath = path.join(dir, "store.sqlite");
  const first = createStore({ dbPath });
  const order = first.order.create({ title: "a", goal: "b", acceptance: "c" });
  first.close();

  const second = createStore({ dbPath });
  try {
    assert.equal(second.order.get(order.id).title, "a");
    assert.equal(second.event.list({ workOrderId: order.id }).length, 1);
  } finally {
    second.close();
  }
}));

test("cancels a ready order and records the event", () => withStore((store) => {
  const order = store.order.create({ title: "t", goal: "g", acceptance: "a", status: "ready" });
  const result = store.order.cancel({ id: order.id, actor: "operator", reason: "scaffolding" });
  assert.equal(result.changed, true);
  assert.equal(result.order.status, "cancelled");
  assert.ok(result.order.closedAt);
  const cancelled = store.event.list({ workOrderId: order.id }).at(-1);
  assert.equal(cancelled.kind, "order.cancelled");
  assert.equal(cancelled.note, "scaffolding");
  assert.equal(store.order.cancel({ id: order.id }).changed, false);
}));

test("cancelling a claimed order clears the lease", () => withStore((store) => {
  const order = store.order.create({ title: "t", goal: "g", acceptance: "a", status: "ready" });
  store.claim.claimById({ id: order.id, agentId: "claude:worker:s1" });
  const result = store.order.cancel({ id: order.id, actor: "operator" });
  assert.equal(result.order.status, "cancelled");
  assert.equal(result.order.assignee, null);
  assert.equal(result.order.claimExpiresAt, null);
}));

test("refuses to cancel an unknown order with a clean error", () => withStore((store) => {
  assert.throws(() => store.order.cancel({ id: "WO-missing" }), /order not found: WO-missing/);
}));

test("refuses to cancel a running order", () => withStore((store) => {
  const order = store.order.create({ title: "t", goal: "g", acceptance: "a", status: "ready" });
  store.claim.claimById({ id: order.id, agentId: "claude:worker:s1" });
  store.attempt.start({ workOrderId: order.id, harness: "claude", agent: "claude:worker:s1" });
  assert.throws(() => store.order.cancel({ id: order.id }), /running attempt/);
  assert.equal(store.order.get(order.id).status, "running");
}));
