import test from "node:test";
import assert from "node:assert/strict";
import { createBrayerHooks } from "../../../../../plugins/opencode/brayer/hooks.js";
import { isBrayerTool, stampBrayerIdentity } from "../../../../../plugins/opencode/brayer/identity.js";

test("matches brayer tools", () => {
  assert.equal(isBrayerTool("brayer_order_get"), true);
  assert.equal(isBrayerTool("read"), false);
  assert.equal(isBrayerTool(null), false);
});

test("overwrites model-supplied identity", () => {
  const output = { args: { brayer_agent: "spoofed", brayer_session: "spoofed" } };
  stampBrayerIdentity({ tool: "brayer_order_get", sessionID: "ses_2" }, output, { agent: "scout" });
  assert.deepEqual(output.args, { brayer_agent: "scout", brayer_session: "ses_2" });
});

test("ignores non-brayer tools", () => {
  const output = { args: {} };
  assert.equal(stampBrayerIdentity({ tool: "read", sessionID: "ses_1" }, output), false);
  assert.deepEqual(output.args, {});
});

test("captures the agent from chat params and stamps a tool call", async () => {
  const hooks = createBrayerHooks();
  await hooks["chat.params"]({ sessionID: "ses_1", agent: "scout" });
  const output = { args: { orderId: "WO-1" } };
  await hooks["tool.execute.before"]({ tool: "brayer_order_get", sessionID: "ses_1" }, output);
  assert.deepEqual(output.args, {
    orderId: "WO-1",
    brayer_agent: "scout",
    brayer_session: "ses_1",
  });
});

test("captures the agent from chat message as a fallback", async () => {
  const hooks = createBrayerHooks();
  await hooks["chat.message"]({ sessionID: "ses_2", agent: "build" });
  const output = { args: {} };
  await hooks["tool.execute.before"]({ tool: "brayer_order_get", sessionID: "ses_2" }, output);
  assert.equal(output.args.brayer_agent, "build");
});

test("the v2 entry keeps the identity and both entrypoints", async () => {
  const mod = await import("../../../../../plugins/opencode/brayer/index.js");
  assert.equal(mod.default.id, "brayer");
  assert.equal(typeof mod.default.setup, "function");
  assert.equal(typeof mod.default.server, "function");
});

test("v2 setup learns the agent from the context hook and stamps the tool input", async () => {
  const { setupBrayer } = await import("../../../../../plugins/opencode/brayer/v2.js");
  const hooks = {};
  const ctx = {
    session: { hook: async (name, callback) => { hooks[name] = callback; return { dispose() {} }; } },
    tool: { hook: async (name, callback) => { hooks[name] = callback; return { dispose() {} }; } },
  };
  const cleanup = await setupBrayer(ctx);

  hooks.context({ sessionID: "ses_2", agent: "build" });
  const event = { tool: "brayer_order_get", sessionID: "ses_2", input: { brayer_agent: "forged" } };
  hooks["execute.before"](event);

  assert.deepEqual(event.input, {
    brayer_agent: "build",
    brayer_session: "ses_2",
  });
  assert.equal(typeof cleanup, "function");
});
