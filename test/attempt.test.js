import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStore } from "../src/store.js";

function withStore(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-attempt-"));
  const store = createStore({ dbPath: path.join(dir, "store.sqlite") });
  try {
    return fn(store);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function claimedOrder(store) {
  const order = store.order.create({
    title: "task",
    goal: "do it",
    acceptance: "it is done",
    status: "ready",
  });
  const res = store.claim.claimById({ id: order.id, agentId: "claude:worker:s1" });
  return res.claimed;
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
