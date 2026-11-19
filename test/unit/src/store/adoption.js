import test from "node:test";
import assert from "node:assert/strict";
import { withStore } from "../../../helpers/store.js";

function fullLifecycle(store, workspace = "/tmp/repo") {
  const order = store.order.create({
    title: "real task",
    goal: "ship it",
    acceptance: "npm test passes",
    status: "ready",
    workspace,
  });
  store.claim.claimById({ id: order.id, agentId: "opencode:build:ses-1", sessionRef: "ses-1" });
  const started = store.attempt.start({
    workOrderId: order.id,
    harness: "opencode",
    agent: "opencode:build:ses-1",
    sessionRef: "ses-1",
  });
  store.checkpoint.write({
    workOrderId: order.id,
    attemptId: started.attempt.id,
    state: { next_step: "review" },
    treeHash: "tree-1",
  });
  store.evidence.attach({
    workOrderId: order.id,
    attemptId: started.attempt.id,
    kind: "log",
    uri: "file:///tmp/test.log",
    sha256: "a".repeat(64),
  });
  store.attempt.reportUsage({ attemptId: started.attempt.id, tokensIn: 100, tokensOut: 20, toolCalls: 4 });
  store.attempt.finish({ attemptId: started.attempt.id, status: "finished" });
  store.verdict.issue({
    workOrderId: order.id,
    decision: "approve",
    reason: "tests pass",
    actor: "opencode:build:ses-1",
  });
  return { order, attempt: started.attempt };
}

test("reports a healthy opencode lifecycle", () => withStore((store) => {
  fullLifecycle(store);
  const report = store.adoption.report({ days: 30 });
  assert.equal(report.claims.total, 1);
  assert.equal(report.claims.real, 1);
  assert.equal(report.claims.matched, 1);
  assert.equal(report.claims.within5m, 1);
  assert.equal(report.attempts.total, 1);
  assert.equal(report.attempts.finished, 1);
  assert.equal(report.attempts.withVerdict, 1);
  assert.equal(report.attempts.withCheckpoint, 1);
  assert.equal(report.attempts.usageReported, 1);
  assert.equal(report.leaseExpiries, 0);
  assert.equal(report.rates.claimToAttempt5m, 1);
  assert.equal(report.rates.verdictShare, 1);
  assert.equal(report.rates.usageShare, 1);
  assert.ok(report.claims.medianToAttemptMs < 5000);
  assert.equal(report.scorecard.find((c) => c.key === "claimToAttempt5m").ok, true);
}));

test("attributes lease expiries to the claiming harness", () => withStore((store) => {
  const opencodeOrder = store.order.create({ title: "a", goal: "g", acceptance: "x", status: "ready" });
  const openclawOrder = store.order.create({ title: "b", goal: "g", acceptance: "x", status: "ready" });
  store.claim.claimById({ id: opencodeOrder.id, agentId: "opencode:build:ses-1", leaseSeconds: 0 });
  store.claim.claimById({ id: openclawOrder.id, agentId: "openclaw:main:ses-2", leaseSeconds: 0 });
  store.claim.sweepExpired({ at: Date.now() + 1 });

  const report = store.adoption.report({ days: 30 });
  assert.equal(report.claims.total, 1);
  assert.equal(report.leaseExpiries, 1);
}));

test("empty store reports null rates without throwing", () => withStore((store) => {
  const report = store.adoption.report({ days: 30 });
  assert.equal(report.claims.total, 0);
  assert.equal(report.attempts.total, 0);
  assert.equal(report.rates.claimToAttempt5m, null);
  assert.equal(report.scorecard.find((c) => c.key === "leaseExpiries").ok, true);
  assert.equal(report.scorecard.find((c) => c.key === "realOrdersPerWeek").ok, false);
}));
