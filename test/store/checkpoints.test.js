import test from "node:test";
import assert from "node:assert/strict";
import { withStore } from "../helpers/store.js";
import { runningAttempt } from "../helpers/fixtures.js";

test("writes a checkpoint on a running attempt", () => withStore((store) => {
  const { order, attempt } = runningAttempt(store);
  const checkpoint = store.checkpoint.write({
    workOrderId: order.id,
    attemptId: attempt.id,
    kind: "stop",
    state: { completed: ["read the repo"], next_step: "edit src/app.js" },
    summary: "stopped after reading",
    confidence: 0.8,
    resumeRecipe: "cd repo && npm test",
    treeHash: "abc123",
    actor: "claude:worker:s1",
  });

  assert.match(checkpoint.id, /^CP-/);
  assert.deepEqual(checkpoint.state, { completed: ["read the repo"], next_step: "edit src/app.js" });
  assert.equal(store.attempt.get(attempt.id).checkpointId, checkpoint.id);
  assert.equal(store.checkpoint.latest({ workOrderId: order.id }).id, checkpoint.id);
  assert.ok(store.event.list({ workOrderId: order.id }).some((e) => e.kind === "checkpoint.written"));
}));

test("latest returns the newest checkpoint", () => withStore((store) => {
  const { order, attempt } = runningAttempt(store);
  const first = store.checkpoint.write({
    workOrderId: order.id, attemptId: attempt.id, state: { n: 1 }, treeHash: "h1",
  });
  const second = store.checkpoint.write({
    workOrderId: order.id, attemptId: attempt.id, state: { n: 2 }, treeHash: "h2",
  });
  assert.equal(store.checkpoint.latest({ workOrderId: order.id }).id, second.id);
  assert.equal(store.checkpoint.list({ workOrderId: order.id }).length, 2);
  assert.equal(store.checkpoint.get(first.id).state.n, 1);
}));

test("refuses a checkpoint without a tree hash", () => withStore((store) => {
  const { order, attempt } = runningAttempt(store);
  assert.throws(() => store.checkpoint.write({
    workOrderId: order.id, attemptId: attempt.id, state: { a: 1 },
  }), /treeHash is required/);
}));

test("refuses a checkpoint on a finished attempt", () => withStore((store) => {
  const { order, attempt } = runningAttempt(store);
  store.attempt.finish({ attemptId: attempt.id, status: "finished" });
  assert.throws(() => store.checkpoint.write({
    workOrderId: order.id, attemptId: attempt.id, state: { a: 1 }, treeHash: "h",
  }), /running attempt/);
}));
