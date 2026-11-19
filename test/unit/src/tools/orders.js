import test from "node:test";
import assert from "node:assert/strict";
import { identity, withClient } from "../../../helpers/mcp.js";

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

test("claiming with start_attempt opens the running attempt", () => withClient(async ({ client }) => {
  const created = await client.callTool({
    name: "brayer_order_create",
    arguments: { ...identity, title: "auto task", goal: "do it", acceptance: "done", status: "ready" },
  });
  const order = JSON.parse(created.content[0].text).order;

  const claimed = await client.callTool({
    name: "brayer_order_claim",
    arguments: { ...identity, orderId: order.id, start_attempt: true, model: "test-model" },
  });
  const body = JSON.parse(claimed.content[0].text);
  assert.equal(body.claimed.status, "claimed");
  assert.equal(body.attempt.status, "running");
  assert.equal(body.attempt.model, "test-model");
  assert.equal(body.order.status, "running");

  const fetched = await client.callTool({
    name: "brayer_order_get",
    arguments: { ...identity, orderId: order.id },
  });
  const trail = JSON.parse(fetched.content[0].text).events.map((event) => event.kind);
  assert.deepEqual(trail, ["order.created", "order.claimed", "attempt.started"]);
}));

test("claimNext with start_attempt opens the attempt", () => withClient(async ({ client }) => {
  await client.callTool({
    name: "brayer_order_create",
    arguments: { ...identity, title: "next task", goal: "do it", acceptance: "done", status: "ready" },
  });
  const claimed = await client.callTool({
    name: "brayer_order_next",
    arguments: { ...identity, start_attempt: true },
  });
  const body = JSON.parse(claimed.content[0].text);
  assert.equal(body.attempt.status, "running");
  assert.equal(body.order.status, "running");
}));

test("cancels an order over MCP", () => withClient(async ({ client }) => {
  const created = await client.callTool({
    name: "brayer_order_create",
    arguments: { ...identity, title: "stale", goal: "nothing", acceptance: "none" },
  });
  const order = JSON.parse(created.content[0].text).order;

  const cancelled = await client.callTool({
    name: "brayer_order_cancel",
    arguments: { ...identity, orderId: order.id, reason: "scaffolding" },
  });
  const body = JSON.parse(cancelled.content[0].text);
  assert.equal(body.changed, true);
  assert.equal(body.order.status, "cancelled");
}));
