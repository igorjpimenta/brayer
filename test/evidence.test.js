import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { withStore } from "../test-support/store.js";
import { runningAttempt } from "../test-support/fixtures.js";
import { storeFile, verifyFile } from "../src/evidence.js";

test("stores a file by content hash and verifies it", () => withStore((store, dir) => {
  const file = path.join(dir, "diff.patch");
  writeFileSync(file, "diff --git a/x b/x\n");
  const stored = storeFile({ root: store.config.blobsPath, filePath: file });
  assert.match(stored.sha256, /^[a-f0-9]{64}$/);
  assert.equal(verifyFile({ root: store.config.blobsPath, sha256: stored.sha256 }), true);
  assert.equal(verifyFile({ root: store.config.blobsPath, sha256: "0".repeat(64) }), false);
}));

test("attaches evidence to a running attempt", () => withStore((store) => {
  const { order, attempt } = runningAttempt(store);
  const evidence = store.evidence.attach({
    workOrderId: order.id,
    attemptId: attempt.id,
    kind: "test",
    uri: "file:///tmp/result.txt",
    sha256: "a".repeat(64),
    summary: "unit suite",
    command: "npm test",
    exitCode: 0,
    status: "passed",
    verifier: "worker",
  });
  assert.match(evidence.id, /^EV-/);
  assert.equal(evidence.kind, "test");
  assert.equal(store.evidence.list({ workOrderId: order.id }).length, 1);
  assert.ok(store.event.list({ workOrderId: order.id }).some((e) => e.kind === "evidence.attached"));
}));

test("refuses an invalid evidence kind", () => withStore((store) => {
  const { order, attempt } = runningAttempt(store);
  assert.throws(() => store.evidence.attach({
    workOrderId: order.id, attemptId: attempt.id, kind: "vibes",
    uri: "file:///tmp/x", sha256: "a".repeat(64),
  }), /invalid evidence kind/);
}));

test("refuses evidence on a finished attempt", () => withStore((store) => {
  const { order, attempt } = runningAttempt(store);
  store.attempt.finish({ attemptId: attempt.id, status: "finished" });
  assert.throws(() => store.evidence.attach({
    workOrderId: order.id, attemptId: attempt.id, kind: "log",
    uri: "file:///tmp/x", sha256: "a".repeat(64),
  }), /running attempt/);
}));
