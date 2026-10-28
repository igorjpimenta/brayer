import test from "node:test";
import assert from "node:assert/strict";
import {
  checkpointPayload,
  resumeContext,
  sessionFromContext,
} from "../../../../../plugins/openclaw/brayer/session.js";

test("builds a session from hook context", () => {
  assert.deepEqual(
    sessionFromContext({ agentId: "scout" }, { sessionKey: "openclaw:scout:s1" }),
    { harness: "openclaw", agent: "scout", session: "openclaw:scout:s1" }
  );
});

test("requires both agent and session", () => {
  assert.equal(sessionFromContext({}, { agentId: "scout" }), null);
  assert.equal(sessionFromContext({}, { sessionKey: "s1" }), null);
});

test("maps a successful turn to an idle checkpoint", () => {
  const payload = checkpointPayload({
    trigger: "idle",
    event: { success: true, messages: [{}, {}], durationMs: 12 },
    workspaceDir: "/repo",
  });
  assert.deepEqual(payload, {
    trigger: "idle",
    state: { trigger: "idle", success: true, messageCount: 2, durationMs: 12 },
    treeHash: "/repo",
  });
});

test("formats a resume context", () => {
  const text = resumeContext({
    id: "CP-1",
    summary: "stopped after tests",
    treeHash: "tree-1",
    resumeRecipe: "npm test",
    state: { next_step: "review" },
  });
  assert.match(text, /CP-1/);
  assert.match(text, /stopped after tests/);
  assert.match(text, /tree-1/);
  assert.match(text, /npm test/);
  assert.match(text, /next_step/);
});

test("returns no context without a checkpoint", () => {
  assert.equal(resumeContext(null), null);
});
