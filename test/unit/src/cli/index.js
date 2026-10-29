import test from "node:test";
import assert from "node:assert/strict";
import { formatStatus } from "../../../../src/cli/index.js";

test("formats an empty queue", () => {
  assert.equal(formatStatus([]), "No work orders.");
});

test("formats order rows with stable columns", () => {
  const out = formatStatus([
    { id: "WO-a", status: "ready", assignee: null, attemptCount: 0, title: "first" },
    { id: "WO-b", status: "running", assignee: "claude:worker:s1", attemptCount: 2, title: "second" },
  ]);
  assert.match(out, /WO-a\s+ready\s+-\s+0\s+first/);
  assert.match(out, /WO-b\s+running\s+claude:worker:s1\s+2\s+second/);
});
