import test from "node:test";
import assert from "node:assert/strict";
import {
  checkpointPayload,
  eventSessionID,
  resumeContext,
} from "../../../../../plugins/opencode/brayer/session.js";

test("reads the session id from an event", () => {
  assert.equal(eventSessionID({ properties: { sessionID: "ses_1" } }), "ses_1");
  assert.equal(eventSessionID({ properties: { info: { id: "ses_2" } } }), "ses_2");
  assert.equal(eventSessionID({}), null);
});

test("maps triggers to checkpoint state", () => {
  assert.deepEqual(
    checkpointPayload({ trigger: "compaction", event: { type: "session.compacted" } }),
    { trigger: "compaction", state: { trigger: "compaction", eventType: "session.compacted", error: null } }
  );
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
