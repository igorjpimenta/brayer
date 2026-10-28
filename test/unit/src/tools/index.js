import test from "node:test";
import assert from "node:assert/strict";
import { withClient } from "../../../helpers/mcp.js";

test("lists the order tools", () => withClient(async ({ client }) => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["brayer_attempt_finish", "brayer_attempt_get", "brayer_attempt_start", "brayer_checkpoint_get", "brayer_checkpoint_write", "brayer_evidence_attach", "brayer_evidence_list", "brayer_order_claim", "brayer_order_create", "brayer_order_get", "brayer_order_heartbeat", "brayer_order_next", "brayer_order_resume", "brayer_verdict_issue", "brayer_verdict_list"]);
}));

test("refuses an unstamped call", () => withClient(async ({ client }) => {
  const res = await client.callTool({
    name: "brayer_order_create",
    arguments: { title: "x", goal: "y", acceptance: "z" },
  });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /agent must be stamped/);
}));
