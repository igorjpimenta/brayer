import test from "node:test";
import assert from "node:assert/strict";
import { withStore } from "../test-support/store.js";
import { reviewOrder } from "../test-support/fixtures.js";

test("approves a reviewed order with evidence", () => withStore((store) => {
  const { order, attempt } = reviewOrder(store);
  const res = store.verdict.issue({
    workOrderId: order.id, attemptId: attempt.id, decision: "approve", reason: "looks good", actor: "operator",
  });
  assert.equal(res.order.status, "approved");
  assert.equal(res.verdict.decision, "approve");
  assert.equal(store.verdict.list({ workOrderId: order.id }).length, 1);
}));

test("refuses approve without evidence", () => withStore((store) => {
  const { order } = reviewOrder(store, false);
  assert.throws(() => store.verdict.issue({
    workOrderId: order.id, decision: "approve", actor: "operator",
  }), /requires at least one evidence/);
}));

test("reject then resume returns ready with the checkpoint", () => withStore((store) => {
  const { order } = reviewOrder(store);
  const rejected = store.verdict.issue({ workOrderId: order.id, decision: "reject", reason: "wrong fix" });
  assert.equal(rejected.order.status, "rejected");

  const resumed = store.resume.resume({ workOrderId: order.id, reason: "retry" });
  assert.equal(resumed.order.status, "ready");
  assert.equal(resumed.checkpoint.treeHash, "tree-1");
}));

test("escalate blocks and resume reopens", () => withStore((store) => {
  const { order } = reviewOrder(store);
  const escalated = store.verdict.issue({ workOrderId: order.id, decision: "escalate", reason: "needs human" });
  assert.equal(escalated.order.status, "blocked");

  const resumed = store.resume.resume({ workOrderId: order.id });
  assert.equal(resumed.order.status, "ready");
}));

test("refuses a verdict outside review or blocked", () => withStore((store) => {
  const order = store.order.create({ title: "t", goal: "g", acceptance: "a", status: "ready" });
  assert.throws(() => store.verdict.issue({ workOrderId: order.id, decision: "approve" }), /requires review or blocked/);
}));
