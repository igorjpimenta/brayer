import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  attachEvidence,
  attachSession,
  checkpointSession,
  finishSession,
  resumeSession,
} from "../../../../plugins/shared/contract.js";
import { withStore } from "../../../helpers/store.js";
import { readyOrder } from "../../../helpers/fixtures.js";

const session = { harness: "opencode", agent: "worker", session: "s1" };
const identity = "opencode:worker:s1";

test("attaches a ready order", () => withStore((store) => {
  const order = readyOrder(store);
  const attached = attachSession({ store, session, orderId: order.id });
  assert.equal(attached.order.status, "running");
  assert.equal(attached.order.assignee, identity);
  assert.equal(attached.attempt.status, "running");
  assert.equal(attached.attempt.agent, identity);
  assert.equal(attached.resumed, true);
}));

test("starts an attempt on an already claimed order", () => withStore((store) => {
  const order = readyOrder(store);
  store.claim.claimById({ id: order.id, agentId: identity });
  const attached = attachSession({ store, session, orderId: order.id });
  assert.equal(attached.order.status, "running");
  assert.equal(attached.attempt.status, "running");
  assert.equal(attached.resumed, false);
}));

test("reuses a live attempt for the same session", () => withStore((store) => {
  const order = readyOrder(store);
  const first = attachSession({ store, session, orderId: order.id });
  const second = attachSession({ store, session, orderId: order.id });
  assert.equal(second.attempt.id, first.attempt.id);
  assert.equal(second.resumed, true);
}));

test("resumes a blocked order from its checkpoint", () => withStore((store) => {
  const order = readyOrder(store);
  const first = attachSession({ store, session, orderId: order.id });
  checkpointSession({
    store, session, orderId: order.id, attemptId: first.attempt.id,
    state: { next_step: "continue" }, treeHash: "tree-1", summary: "stopped",
  });
  finishSession({ store, session, attemptId: first.attempt.id });
  store.verdict.issue({ workOrderId: order.id, decision: "escalate", reason: "human" });

  const resumed = resumeSession({ store, session, orderId: order.id });
  assert.equal(resumed.order.status, "running");
  assert.equal(resumed.attempt.status, "running");
  assert.equal(resumed.checkpoint.treeHash, "tree-1");
  assert.equal(resumed.resumed, true);
}));

test("refuses an order assigned to another agent", () => withStore((store) => {
  const order = readyOrder(store);
  store.claim.claimById({ id: order.id, agentId: "codex:other:s9" });
  assert.throws(
    () => attachSession({ store, session, orderId: order.id }),
    /assigned to codex:other:s9/
  );
}));

test("maps checkpoint triggers to checkpoint kinds", () => withStore((store) => {
  const order = readyOrder(store);
  const attached = attachSession({ store, session, orderId: order.id });
  const expected = { idle: "auto", compaction: "pre_compact", error: "error", stop: "stop", manual: "manual" };
  for (const [trigger, kind] of Object.entries(expected)) {
    const checkpoint = checkpointSession({
      store, session, orderId: order.id, attemptId: attached.attempt.id,
      trigger, state: { trigger }, treeHash: trigger,
    });
    assert.equal(checkpoint.kind, kind);
  }
}));

test("refuses an unknown checkpoint trigger", () => withStore((store) => {
  const order = readyOrder(store);
  const attached = attachSession({ store, session, orderId: order.id });
  assert.throws(() => checkpointSession({
    store, session, orderId: order.id, attemptId: attached.attempt.id,
    trigger: "later", state: {}, treeHash: "tree",
  }), /unknown checkpoint trigger/);
}));

test("attaches content-addressed evidence", () => withStore((store, dir) => {
  const order = readyOrder(store);
  const attached = attachSession({ store, session, orderId: order.id });
  const file = path.join(dir, "diff.patch");
  writeFileSync(file, "diff --git a/x b/x\n");
  const evidence = attachEvidence({
    store, session, orderId: order.id, attemptId: attached.attempt.id,
    kind: "diff", path: file, summary: "one line",
  });
  assert.match(evidence.sha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.kind, "diff");
}));

test("finishes an attempt", () => withStore((store) => {
  const order = readyOrder(store);
  const attached = attachSession({ store, session, orderId: order.id });
  const finished = finishSession({ store, session, attemptId: attached.attempt.id, summary: "done" });
  assert.equal(finished.attempt.status, "finished");
  assert.equal(finished.order.status, "review");
}));

test("requires a complete session", () => withStore((store) => {
  const order = readyOrder(store);
  assert.throws(() => attachSession({ store, session: { harness: "opencode" }, orderId: order.id }), /requires harness, agent and session/);
}));
