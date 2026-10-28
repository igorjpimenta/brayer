import test from "node:test";
import assert from "node:assert/strict";
import { isBrayerTool, stampBrayerIdentity } from "../../../../plugins/opencode/brayer.js";

test("matches brayer tools", () => {
  assert.equal(isBrayerTool("brayer_order_get"), true);
  assert.equal(isBrayerTool("read"), false);
  assert.equal(isBrayerTool(null), false);
});

test("stamps agent and session into tool args", () => {
  const output = { args: { orderId: "WO-1" } };
  const changed = stampBrayerIdentity(
    { tool: "brayer_order_get", sessionID: "ses_1" },
    output,
    { BRAYER_AGENT: "scout" }
  );
  assert.equal(changed, true);
  assert.deepEqual(output.args, {
    orderId: "WO-1",
    brayer_agent: "scout",
    brayer_session: "ses_1",
  });
});

test("does not overwrite explicit identity", () => {
  const output = { args: { brayer_agent: "worker", brayer_session: "s1" } };
  stampBrayerIdentity({ tool: "brayer_order_get", sessionID: "ses_2" }, output, { BRAYER_AGENT: "scout" });
  assert.deepEqual(output.args, { brayer_agent: "worker", brayer_session: "s1" });
});

test("ignores non-brayer tools", () => {
  const output = { args: {} };
  assert.equal(stampBrayerIdentity({ tool: "read", sessionID: "ses_1" }, output), false);
  assert.deepEqual(output.args, {});
});
