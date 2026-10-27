import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStore } from "../src/store.js";
import { storeFile, verifyFile } from "../src/evidence.js";

function withStore(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-evidence-"));
  const store = createStore({
    dbPath: path.join(dir, "store.sqlite"),
    config: { blobsPath: path.join(dir, "blobs") },
  });
  try {
    return fn(store, dir);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function runningAttempt(store) {
  const order = store.order.create({ title: "task", goal: "do it", acceptance: "done", status: "ready" });
  store.claim.claimById({ id: order.id, agentId: "claude:worker:s1" });
  const started = store.attempt.start({ workOrderId: order.id, harness: "claude", agent: "claude:worker:s1" });
  return { order, attempt: started.attempt };
}

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
