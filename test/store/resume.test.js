import test from "node:test";
import assert from "node:assert/strict";
import { withStore } from "../helpers/store.js";
import { reviewOrder } from "../helpers/fixtures.js";

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
