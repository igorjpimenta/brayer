import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { identity, withClient } from "../../../helpers/mcp.js";

test("issues an approve verdict over MCP", () => withClient(async ({ client, dir }) => {
  const created = await client.callTool({
    name: "brayer_order_create",
    arguments: { ...identity, title: "verdict task", goal: "do it", acceptance: "done", status: "ready" },
  });
  const order = JSON.parse(created.content[0].text).order;
  await client.callTool({ name: "brayer_order_claim", arguments: { ...identity, orderId: order.id } });
  const started = await client.callTool({ name: "brayer_attempt_start", arguments: { ...identity, orderId: order.id } });
  const attempt = JSON.parse(started.content[0].text).attempt;

  const file = path.join(dir, "diff.patch");
  writeFileSync(file, "diff --git a/x b/x\n");
  await client.callTool({
    name: "brayer_evidence_attach",
    arguments: { ...identity, orderId: order.id, attemptId: attempt.id, kind: "diff", path: file },
  });
  await client.callTool({ name: "brayer_attempt_finish", arguments: { ...identity, attemptId: attempt.id, status: "finished" } });

  const verdict = await client.callTool({
    name: "brayer_verdict_issue",
    arguments: { ...identity, orderId: order.id, decision: "approve", reason: "ok" },
  });
  assert.equal(JSON.parse(verdict.content[0].text).order.status, "approved");
}));
