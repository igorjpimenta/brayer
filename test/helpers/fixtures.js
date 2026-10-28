export function readyOrder(store, overrides = {}) {
  return store.order.create({
    title: "task",
    goal: "do it",
    acceptance: "done",
    status: "ready",
    ...overrides,
  });
}

export function claimedOrder(store, overrides = {}) {
  const order = readyOrder(store, overrides);
  return store.claim.claimById({ id: order.id, agentId: "claude:worker:s1" }).claimed;
}

export function runningAttempt(store, overrides = {}) {
  const order = claimedOrder(store, overrides);
  const started = store.attempt.start({
    workOrderId: order.id,
    harness: "claude",
    agent: "claude:worker:s1",
    sessionRef: "s1",
  });
  return { order, attempt: started.attempt };
}

export function reviewOrder(store, withEvidence = true) {
  const { order, attempt } = runningAttempt(store);
  store.checkpoint.write({
    workOrderId: order.id,
    attemptId: attempt.id,
    state: { next_step: "review" },
    treeHash: "tree-1",
    actor: "claude:worker:s1",
  });
  if (withEvidence) {
    store.evidence.attach({
      workOrderId: order.id,
      attemptId: attempt.id,
      kind: "diff",
      uri: "file:///tmp/diff.patch",
      sha256: "a".repeat(64),
      summary: "diff",
    });
  }
  store.attempt.finish({ attemptId: attempt.id, status: "finished", checkpointId: attempt.id });
  return { order: store.order.get(order.id), attempt };
}
