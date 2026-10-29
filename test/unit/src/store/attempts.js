import test from "node:test";
import assert from "node:assert/strict";
import { withStore } from "../../../helpers/store.js";
import { claimedOrder, runningAttempt } from "../../../helpers/fixtures.js";

test("starts and finishes an attempt", () => withStore((store) => {
  const order = claimedOrder(store);
  const started = store.attempt.start({
    workOrderId: order.id,
    harness: "claude",
    agent: "claude:worker:s1",
    sessionRef: "s1",
    model: "sonnet",
  });
  assert.equal(started.reason, null);
  assert.equal(started.attempt.status, "running");
  assert.equal(started.order.status, "running");

  const finished = store.attempt.finish({
    attemptId: started.attempt.id,
    status: "finished",
    summary: "done",
    toolCalls: 12,
  });
  assert.equal(finished.attempt.status, "finished");
  assert.equal(finished.order.status, "review");
  assert.equal(finished.attempt.toolCalls, 12);
}));

test("refuses a second live attempt", () => withStore((store) => {
  const order = claimedOrder(store);
  const first = store.attempt.start({ workOrderId: order.id, harness: "claude", agent: "claude:worker:s1" });
  const second = store.attempt.start({ workOrderId: order.id, harness: "claude", agent: "claude:worker:s1" });
  assert.equal(second.reason, "already_running");
  assert.equal(second.attempt.id, first.attempt.id);
}));

test("a failed attempt returns the order to ready", () => withStore((store) => {
  const order = claimedOrder(store);
  const started = store.attempt.start({ workOrderId: order.id, harness: "claude", agent: "claude:worker:s1" });
  const failed = store.attempt.finish({ attemptId: started.attempt.id, status: "failed", error: "context exhausted" });
  assert.equal(failed.attempt.status, "failed");
  assert.equal(failed.order.status, "ready");
  assert.equal(failed.order.assignee, null);
}));

test("refuses to start an attempt on an unclaimed order", () => withStore((store) => {
  const order = store.order.create({ title: "t", goal: "g", acceptance: "a", status: "ready" });
  const res = store.attempt.start({ workOrderId: order.id, harness: "claude", agent: "claude:worker:s1" });
  assert.equal(res.reason, "not_claimed");
}));

test("lists attempts for an order", () => withStore((store) => {
  const order = claimedOrder(store);
  const started = store.attempt.start({ workOrderId: order.id, harness: "claude", agent: "claude:worker:s1" });
  store.attempt.finish({ attemptId: started.attempt.id, status: "failed" });
  const all = store.attempt.list({ workOrderId: order.id });
  assert.equal(all.length, 1);
  assert.equal(all[0].id, started.attempt.id);
}));

test("finish preserves an existing checkpoint link when checkpointId is omitted", () => withStore((store) => {
  const { order, attempt } = runningAttempt(store);
  const checkpoint = store.checkpoint.write({
    workOrderId: order.id,
    attemptId: attempt.id,
    state: { next_step: "review" },
    treeHash: "tree-1",
  });
  const finished = store.attempt.finish({ attemptId: attempt.id, status: "finished" });
  assert.equal(finished.attempt.checkpointId, checkpoint.id);
}));
