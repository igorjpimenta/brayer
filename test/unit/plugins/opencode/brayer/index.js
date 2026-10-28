import test from "node:test";
import assert from "node:assert/strict";
import { isBrayerTool, stampBrayerIdentity } from "../../../../../plugins/opencode/brayer/identity.js";

test("matches brayer tools", () => {
  assert.equal(isBrayerTool("brayer_order_get"), true);
  assert.equal(isBrayerTool("read"), false);
  assert.equal(isBrayerTool(null), false);
});

test("leaves the agent unset when the session has no agent", () => {
  const output = { args: {} };
  stampBrayerIdentity({ tool: "brayer_order_get", sessionID: "ses_1" }, output);
  assert.deepEqual(output.args, { brayer_session: "ses_1" });
});

test("does not overwrite explicit identity", () => {
  const output = { args: { brayer_agent: "worker", brayer_session: "s1" } };
  stampBrayerIdentity({ tool: "brayer_order_get", sessionID: "ses_2" }, output, { agent: "scout" });
  assert.deepEqual(output.args, { brayer_agent: "worker", brayer_session: "s1" });
});

test("stamps an explicit agent", () => {
  const output = { args: {} };
  assert.equal(
    stampBrayerIdentity({ tool: "brayer_order_get", sessionID: "ses_1" }, output, { agent: "worker" }),
    true
  );
  assert.deepEqual(output.args, { brayer_agent: "worker", brayer_session: "ses_1" });
});

test("ignores non-brayer tools", () => {
  const output = { args: {} };
  assert.equal(stampBrayerIdentity({ tool: "read", sessionID: "ses_1" }, output), false);
  assert.deepEqual(output.args, {});
});
