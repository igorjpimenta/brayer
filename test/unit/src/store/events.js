import test from "node:test";
import assert from "node:assert/strict";
import { withStore } from "../../../helpers/store.js";

test("lists events for an order after an id", () => withStore((store) => {
  const order = store.order.create({ title: "t", goal: "g", acceptance: "a", status: "ready" });
  store.claim.claimById({ id: order.id, agentId: "claude:worker:s1" });

  const all = store.event.list({ workOrderId: order.id });
  assert.deepEqual(all.map((e) => e.kind), ["order.created", "order.claimed"]);

  const after = store.event.list({ workOrderId: order.id, afterId: all[0].id });
  assert.deepEqual(after.map((e) => e.kind), ["order.claimed"]);
}));
