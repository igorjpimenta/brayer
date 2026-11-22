import test from "node:test";
import assert from "node:assert/strict";
import { withStore } from "../../../helpers/store.js";
import { runningAttempt } from "../../../helpers/fixtures.js";
import { runCheckpoint } from "../../../../src/cli/checkpoint.js";

test("checkpoint write resolves the attempt from the session and writes an auto checkpoint", () => withStore(async (store, _dir, dbPath) => {
  const env = { BRAYER_DB: dbPath };
  const { order, attempt } = runningAttempt(store);

  const result = await runCheckpoint({ rest: ["write", "--session", "s1", "--summary", "turn done"], env });
  assert.equal(result.written, true);
  assert.match(result.checkpointId, /^CP-/);

  const written = store.checkpoint.get(result.checkpointId);
  assert.equal(written.attemptId, attempt.id);
  assert.equal(written.workOrderId, order.id);
  assert.equal(written.kind, "auto");
  assert.equal(written.summary, "turn done");
  assert.match(written.treeHash, /^[0-9a-f]{64}$/);
  assert.equal(written.state.source, "brayer-opencode");
  // The attempt now carries a checkpoint, which is what requireCheckpoint checks.
  assert.equal(store.attempt.get(attempt.id).checkpointId, result.checkpointId);
}));

test("checkpoint write accepts an explicit state object", () => withStore(async (store, _dir, dbPath) => {
  const env = { BRAYER_DB: dbPath };
  const { attempt } = runningAttempt(store);
  const result = await runCheckpoint({
    rest: ["write", "--session", "s1", "--state", JSON.stringify({ next: "edit config" })],
    env,
  });
  assert.equal(result.written, true);
  const written = store.checkpoint.get(result.checkpointId);
  assert.deepEqual(written.state, { next: "edit config" });
  assert.ok(store.attempt.get(attempt.id).checkpointId);
}));

test("checkpoint write is a no-op without a running attempt", () => withStore(async (_store, _dir, dbPath) => {
  const env = { BRAYER_DB: dbPath };
  const result = await runCheckpoint({ rest: ["write", "--session", "ses_none"], env });
  assert.deepEqual(result, { written: false, reason: "no_running_attempt" });
}));

test("checkpoint write rejects a non-object state", () => withStore(async (store, _dir, dbPath) => {
  const env = { BRAYER_DB: dbPath };
  runningAttempt(store);
  await assert.rejects(
    () => runCheckpoint({ rest: ["write", "--session", "s1", "--state", "[1,2]"], env }),
    /JSON object/,
  );
}));
