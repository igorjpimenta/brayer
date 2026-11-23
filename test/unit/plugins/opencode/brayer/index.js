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

test("setup injects the ready-work digest once per session", async () => {
  const { setup } = await import("../../../../../plugins/opencode/brayer/setup.js");
  const hooks = {};
  const ctx = {
    session: { hook: async (name, callback) => { hooks[name] = callback; return { dispose() {} }; } },
    tool: { hook: async (name, callback) => { hooks[name] = callback; return { dispose() {} }; } },
  };
  let digestCalls = 0;
  const buildDigest = async () => {
    digestCalls += 1;
    return "Brayer: 1 ready work order.";
  };
  await setup(ctx, { buildDigest });

  const first = { sessionID: "ses_5", agent: "build", system: [] };
  await hooks.context(first);
  assert.deepEqual(first.system, [{ type: "text", text: "Brayer: 1 ready work order." }]);

  const second = { sessionID: "ses_5", agent: "build", system: [] };
  await hooks.context(second);
  assert.deepEqual(second.system, []);
  assert.equal(digestCalls, 1);
});

test("setup never injects when the digest is empty and survives a digest error", async () => {
  const { setup } = await import("../../../../../plugins/opencode/brayer/setup.js");
  const hooks = {};
  const ctx = {
    session: { hook: async (name, callback) => { hooks[name] = callback; return { dispose() {} }; } },
    tool: { hook: async (name, callback) => { hooks[name] = callback; return { dispose() {} }; } },
  };
  await setup(ctx, { buildDigest: async () => null });
  const event = { sessionID: "ses_6", agent: "build", system: [] };
  await hooks.context(event);
  assert.deepEqual(event.system, []);

  await setup({ session: { hook: async () => ({ dispose() {} }) } }, {
    buildDigest: async () => { throw new Error("boom"); },
  });
});

test("setup captures a checkpoint on idle for brayer sessions only", async () => {
  const { setup } = await import("../../../../../plugins/opencode/brayer/setup.js");
  const hooks = {};
  let release = null;
  const gate = new Promise((resolve) => { release = resolve; });
  const ctx = {
    session: { hook: async (name, callback) => { hooks[name] = callback; return { dispose() {} }; } },
    tool: { hook: async (name, callback) => { hooks[name] = callback; return { dispose() {} }; } },
    event: {
      subscribe: async (options) => {
        assert.deepEqual(options.types, ["session.idle"]);
        return (async function* generate() {
          yield { type: "session.idle", data: { sessionID: "ses_10" } };
          await gate;
          yield { type: "session.idle", data: { sessionID: "ses_9" } };
        })();
      },
    },
  };
  const captured = [];
  const cleanup = await setup(ctx, {
    buildDigest: async () => null,
    makeCapture: () => async ({ sessionID }) => { captured.push(sessionID); },
  });
  // Brayer session: stamped by a tool call, then captured on its idle event.
  hooks["execute.before"]({ tool: "brayer_order_get", sessionID: "ses_9", input: {} });
  release();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(captured, ["ses_9"]);
  assert.equal(typeof cleanup, "function");
});

test("the V1 host injects the digest into the first user message once per session", async () => {
  let digestCalls = 0;
  const hooks = createBrayerHooks({ buildDigest: async () => { digestCalls += 1; return "Brayer: ready."; } });
  await hooks["chat.params"]({ sessionID: "ses_1", agent: "build" });
  const messages = (text) => [{ info: { role: "user" }, parts: [{ type: "text", text }] }];
  const first = { messages: messages("do the thing") };
  await hooks["experimental.chat.messages.transform"]({}, first);
  assert.equal(first.messages[0].parts[0].type, "text");
  assert.equal(first.messages[0].parts[0].text, "Brayer: ready.");
  assert.equal(first.messages[0].parts[1].text, "do the thing");

  const second = { messages: [...messages("do the thing"), { info: { role: "assistant" }, parts: [] }, { info: { role: "user" }, parts: [{ type: "text", text: "second turn" }] }] };
  await hooks["experimental.chat.messages.transform"]({}, second);
  assert.equal(second.messages[0].parts.length, 1);
  assert.equal(digestCalls, 1);
});

test("the V1 digest skips turns without a user message and survives digest errors", async () => {
  const hooks = createBrayerHooks({ buildDigest: async () => { throw new Error("boom"); } });
  await hooks["experimental.chat.messages.transform"]({}, { messages: [{ info: { role: "user" }, parts: [{ type: "text", text: "hi" }] }] });
  await hooks["experimental.chat.messages.transform"]({}, { messages: [] });
  await hooks["experimental.chat.messages.transform"]({}, {});
});

test("the V1 event hook captures only session.idle events for brayer sessions", async () => {
  const captured = [];
  const hooks = createBrayerHooks({ makeCapture: () => async ({ sessionID }) => { captured.push(sessionID); } });
  await hooks["tool.execute.before"]({ tool: "brayer_order_get", sessionID: "ses_7" }, { args: {} });
  await hooks["event"]({ event: { type: "session.updated", properties: { sessionID: "ses_7" } } });
  await hooks["event"]({ event: { type: "session.idle", properties: { sessionID: "ses_7" } } });
  await hooks["event"]({ event: { type: "session.idle", properties: { sessionID: "ses_8" } } });
  assert.deepEqual(captured, ["ses_7"]);
});
