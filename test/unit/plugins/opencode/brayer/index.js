import test from "node:test";
import assert from "node:assert/strict";
import { createBrayerHooks } from "../../../../../plugins/opencode/brayer/hooks.js";
import { isBrayerTool, stampBrayerIdentity, stampStartAttempt } from "../../../../../plugins/opencode/brayer/identity.js";

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

test("the entry keeps the identity and both entrypoints", async () => {
  const mod = await import("../../../../../plugins/opencode/brayer/index.js");
  assert.equal(mod.default.id, "brayer");
  assert.equal(typeof mod.default.setup, "function");
  assert.equal(typeof mod.default.server, "function");
});

test("setup learns the agent from the session context hook and stamps the tool input", async () => {
  const { setup } = await import("../../../../../plugins/opencode/brayer/setup.js");
  const hooks = {};
  const ctx = {
    session: { hook: async (name, callback) => { hooks[name] = callback; return { dispose() {} }; } },
    tool: { hook: async (name, callback) => { hooks[name] = callback; return { dispose() {} }; } },
  };
  const cleanup = await setup(ctx);

  hooks.context({ sessionID: "ses_2", agent: "build" });
  const event = { tool: "brayer_order_get", sessionID: "ses_2", input: { brayer_agent: "forged" } };
  hooks["execute.before"](event);

  assert.deepEqual(event.input, {
    brayer_agent: "build",
    brayer_session: "ses_2",
  });
  assert.equal(typeof cleanup, "function");
});

test("claim and next force start_attempt", () => {
  for (const tool of ["brayer_brayer_order_claim", "brayer_order_next"]) {
    const output = { args: { start_attempt: false } };
    assert.equal(stampStartAttempt({ tool }, output), true);
    assert.equal(output.args.start_attempt, true);
  }
  const read = { args: {} };
  assert.equal(stampStartAttempt({ tool: "brayer_order_get" }, read), false);
  assert.deepEqual(read.args, {});
});

test("the V1 hook opens the attempt in the same call as the claim", async () => {
  const hooks = createBrayerHooks();
  await hooks["chat.params"]({ sessionID: "ses_1", agent: "build" });
  const output = { args: { start_attempt: false } };
  await hooks["tool.execute.before"]({ tool: "brayer_brayer_order_claim", sessionID: "ses_1" }, output);
  assert.equal(output.args.start_attempt, true);
  assert.equal(output.args.brayer_agent, "build");
  assert.equal(output.args.brayer_session, "ses_1");
});

test("setup opens the attempt in the same call as the claim", async () => {
  const { setup } = await import("../../../../../plugins/opencode/brayer/setup.js");
  const hooks = {};
  const ctx = {
    session: { hook: async (name, callback) => { hooks[name] = callback; return { dispose() {} }; } },
    tool: { hook: async (name, callback) => { hooks[name] = callback; return { dispose() {} }; } },
  };
  await setup(ctx);
  hooks.context({ sessionID: "ses_3", agent: "build" });
  const event = { tool: "brayer_brayer_order_claim", sessionID: "ses_3", input: { start_attempt: false } };
  hooks["execute.before"](event);
  assert.equal(event.input.start_attempt, true);
});
