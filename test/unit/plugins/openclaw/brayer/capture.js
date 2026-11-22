import test from "node:test";
import assert from "node:assert/strict";
import { withStore } from "../../../../helpers/store.js";
import { runningAttempt } from "../../../../helpers/fixtures.js";
import { createDiscoveryCapture } from "../../../../../plugins/openclaw/brayer/capture.js";

const session = { harness: "openclaw", agent: "openclaw:worker:s1", session: "s1" };

test("writes an auto checkpoint for the running attempt", () => withStore((store) => {
  const { attempt } = runningAttempt(store);
  const capture = createDiscoveryCapture({ store: () => store, minIntervalMs: 0 });
  const checkpoint = capture({ session, attempt });
  assert.match(checkpoint.id, /^CP-/);
  const written = store.checkpoint.get(checkpoint.id);
  assert.equal(written.kind, "auto");
  assert.equal(written.attemptId, attempt.id);
  assert.equal(written.treeHash, "unknown");
  // the attempt now carries a checkpoint, which is what requireCheckpoint counts
  assert.equal(store.attempt.get(attempt.id).checkpointId, checkpoint.id);
}));

test("throttles per session and can be disabled", () => withStore((store) => {
  const { attempt } = runningAttempt(store);
  const capture = createDiscoveryCapture({ store: () => store, minIntervalMs: 60000 });
  assert.ok(capture({ session, attempt }));
  assert.equal(capture({ session, attempt }), null);

  const disabled = createDiscoveryCapture({
    store: () => store,
    minIntervalMs: 0,
    env: { BRAYER_CAPTURE_DISABLE: "1" },
  });
  assert.equal(disabled({ session, attempt }), null);
  assert.equal(disabled({}), null);
}));

test("is silent when the attempt is not running", () => withStore((store) => {
  const { attempt } = runningAttempt(store);
  store.attempt.finish({ attemptId: attempt.id, status: "finished", summary: "done" });
  const warns = [];
  const capture = createDiscoveryCapture({
    store: () => store,
    minIntervalMs: 0,
    logger: { warn: (line) => warns.push(line) },
  });
  assert.equal(capture({ session, attempt }), null);
  assert.equal(warns.length, 1);
  assert.match(warns[0], /running attempt/);
}));
