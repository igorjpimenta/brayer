import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createStore } from "../../../../src/store.js";
import { withStore, withTempDir } from "../../../helpers/store.js";
import { claimedOrder, runningAttempt } from "../../../helpers/fixtures.js";

function configuredStore(dir, config) {
  return createStore({
    dbPath: path.join(dir, "store.sqlite"),
    config: { claimWebhookUrl: "http://127.0.0.1:9/claimed", ...config },
  });
}

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

test("accumulates reported usage and preserves it when finish omits totals", () => withStore((store) => {
  const { attempt } = runningAttempt(store);
  const first = store.attempt.reportUsage({
    attemptId: attempt.id,
    model: "sonnet",
    tokensIn: 100,
    tokensOut: 50,
    cacheRead: 10,
    costUsd: 0.012,
    toolCalls: 3,
  });
  assert.equal(first.reason, null);
  assert.equal(first.attempt.model, "sonnet");
  assert.equal(first.attempt.tokensIn, 100);
  assert.equal(first.attempt.toolCalls, 3);
  const second = store.attempt.reportUsage({
    attemptId: attempt.id,
    tokensIn: 25,
    tokensOut: 25,
    costUsd: 0.008,
    toolCalls: 2,
  });
  assert.equal(second.attempt.tokensIn, 125);
  assert.equal(second.attempt.tokensOut, 75);
  assert.equal(second.attempt.costUsd, 0.02);
  assert.equal(second.attempt.toolCalls, 5);
  const finished = store.attempt.finish({ attemptId: attempt.id, status: "finished" });
  assert.equal(finished.attempt.tokensIn, 125);
  assert.equal(finished.attempt.tokensOut, 75);
  assert.equal(finished.attempt.costUsd, 0.02);
  assert.equal(finished.attempt.toolCalls, 5);
}));

test("finish totals override accumulated usage when provided", () => withStore((store) => {
  const { attempt } = runningAttempt(store);
  store.attempt.reportUsage({ attemptId: attempt.id, tokensIn: 100, toolCalls: 3 });
  const finished = store.attempt.finish({
    attemptId: attempt.id,
    status: "finished",
    tokensIn: 150,
    tokensOut: 75,
    cacheRead: 5,
    costUsd: 0.03,
    toolCalls: 7,
  });
  assert.equal(finished.attempt.tokensIn, 150);
  assert.equal(finished.attempt.toolCalls, 7);
}));

test("refuses invalid or finished usage reports", () => withStore((store) => {
  const { attempt } = runningAttempt(store);
  assert.throws(() => store.attempt.reportUsage({ attemptId: attempt.id, tokensIn: -1 }), /non-negative number/);
  assert.throws(() => store.attempt.reportUsage({ attemptId: attempt.id, toolCalls: 1.5 }), /must be an integer/);
  assert.throws(() => store.attempt.reportUsage({}), /attemptId is required/);
  store.attempt.finish({ attemptId: attempt.id, status: "failed" });
  assert.equal(store.attempt.reportUsage({ attemptId: attempt.id, toolCalls: 1 }).reason, "not_running");
}));

test("requires a checkpoint before finishing when configured", () => withTempDir((dir) => {
  const store = configuredStore(dir, { requireCheckpoint: true });
  try {
    const { order, attempt } = runningAttempt(store);
    assert.throws(() => store.attempt.finish({ attemptId: attempt.id, status: "finished" }), /checkpoint is required/);
    const checkpoint = store.checkpoint.write({
      workOrderId: order.id,
      attemptId: attempt.id,
      state: { next_step: "review" },
      treeHash: "tree-1",
    });
    const finished = store.attempt.finish({ attemptId: attempt.id, status: "finished", checkpointId: checkpoint.id });
    assert.equal(finished.attempt.status, "finished");
  } finally {
    store.close();
  }
}));

test("requires usage before finishing when configured", () => withTempDir((dir) => {
  const store = configuredStore(dir, { requireUsage: true });
  try {
    const { attempt } = runningAttempt(store);
    assert.throws(() => store.attempt.finish({ attemptId: attempt.id, status: "finished" }), /usage must be reported/);
    store.attempt.reportUsage({ attemptId: attempt.id, tokensIn: 10 });
    const finished = store.attempt.finish({ attemptId: attempt.id, status: "finished" });
    assert.equal(finished.attempt.status, "finished");
  } finally {
    store.close();
  }
}));

test("forSession finds the latest running attempt for a session ref", () => withStore((store) => {
  assert.equal(store.attempt.forSession("ses_x"), null);

  const first = runningAttempt(store);
  assert.equal(store.attempt.forSession("s1").id, first.attempt.id);

  // finished attempts do not match the default running filter
  store.attempt.finish({ attemptId: first.attempt.id, status: "finished", summary: "done" });
  assert.equal(store.attempt.forSession("s1"), null);
  assert.equal(store.attempt.forSession("s1", { status: "finished" }).id, first.attempt.id);
}));
