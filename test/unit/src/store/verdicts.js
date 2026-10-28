import test from "node:test";
import assert from "node:assert/strict";
import { withStore } from "../../../helpers/store.js";
import { reviewOrder } from "../../../helpers/fixtures.js";

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

test("refuses a verdict outside review or blocked", () => withStore((store) => {
  const order = store.order.create({ title: "t", goal: "g", acceptance: "a", status: "ready" });
  assert.throws(() => store.verdict.issue({ workOrderId: order.id, decision: "approve" }), /requires review or blocked/);
}));
