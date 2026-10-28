import test from "node:test";
import assert from "node:assert/strict";
import { identity, withClient } from "./helpers/mcp.js";

test("creates and reads an order over MCP", () => withClient(async ({ client }) => {
  const created = await client.callTool({
    name: "brayer_order_create",
    arguments: {
      ...identity,
      title: "Fix intake 500",
      goal: "The intake endpoint returns 200",
      acceptance: "POST /api/intake returns 200",
      approvalMode: "evidence",
    },
  });
  assert.equal(created.isError, undefined);
  const order = JSON.parse(created.content[0].text).order;
  assert.match(order.id, /^WO-/);

  const fetched = await client.callTool({
    name: "brayer_order_get",
    arguments: { ...identity, orderId: order.id },
  });
  const body = JSON.parse(fetched.content[0].text);
  assert.equal(body.order.id, order.id);
  assert.equal(body.events[0].kind, "order.created");
}));

test("claims a ready order over MCP", () => withClient(async ({ client }) => {
  const created = await client.callTool({
    name: "brayer_order_create",
    arguments: { ...identity, title: "ready task", goal: "do it", acceptance: "done", status: "ready" },
  });
  const order = JSON.parse(created.content[0].text).order;

  const claimed = await client.callTool({
    name: "brayer_order_claim",
    arguments: { ...identity, orderId: order.id, leaseSeconds: 60 },
  });
  const body = JSON.parse(claimed.content[0].text);
  assert.equal(body.claimed.status, "claimed");
  assert.equal(body.claimed.assignee, "test:worker:s1");
}));
