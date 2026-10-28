import test from "node:test";
import assert from "node:assert/strict";
import { identity, withClient } from "../helpers/mcp.js";

test("writes and reads a checkpoint over MCP", () => withClient(async ({ client }) => {
  const created = await client.callTool({
    name: "brayer_order_create",
    arguments: { ...identity, title: "checkpoint task", goal: "do it", acceptance: "done", status: "ready" },
  });
  const order = JSON.parse(created.content[0].text).order;
  await client.callTool({ name: "brayer_order_claim", arguments: { ...identity, orderId: order.id } });
  const started = await client.callTool({ name: "brayer_attempt_start", arguments: { ...identity, orderId: order.id } });
  const attempt = JSON.parse(started.content[0].text).attempt;

  const written = await client.callTool({
    name: "brayer_checkpoint_write",
    arguments: {
      ...identity, orderId: order.id, attemptId: attempt.id,
      state: { next_step: "continue" }, treeHash: "tree-1",
    },
  });
  const checkpoint = JSON.parse(written.content[0].text).checkpoint;
  assert.match(checkpoint.id, /^CP-/);

  const latest = await client.callTool({
    name: "brayer_checkpoint_get",
    arguments: { ...identity, orderId: order.id },
  });
  assert.equal(JSON.parse(latest.content[0].text).checkpoint.id, checkpoint.id);
}));
