import { storeFile } from "../../src/evidence.js";
import { identityKey } from "../../src/identity.js";

export const CHECKPOINT_TRIGGERS = Object.freeze({
  idle: "auto",
  compaction: "pre_compact",
  error: "error",
  stop: "stop",
  manual: "manual",
});

function assertSession(session) {
  if (!session?.harness || !session?.agent || !session?.session) {
    throw new Error("brayer: adapter session requires harness, agent and session");
  }
  return {
    harness: session.harness,
    agent: session.agent,
    session: session.session,
  };
}

function sessionIdentity(session) {
  return identityKey(assertSession(session));
}

function claimOrResume({ store, session, orderId }) {
  const identity = sessionIdentity(session);
  let order = store.order.get(orderId);
  if (!order) throw new Error(`brayer: order not found: ${orderId}`);

  let resumed = false;
  if (order.status === "rejected" || order.status === "blocked") {
    order = store.resume.resume({
      workOrderId: orderId,
      actor: identity,
      reason: "adapter resume",
    }).order;
    resumed = true;
  }

  if (order.status === "ready") {
    const claimed = store.claim.claimById({
      id: orderId,
      agentId: identity,
      sessionRef: session.session,
    });
    if (!claimed.claimed) {
      throw new Error(`brayer: could not claim ${orderId}: ${claimed.reason}`);
    }
    order = claimed.claimed;
    resumed = true;
  }

  if (order.status === "claimed") {
    if (order.assignee !== identity) {
      throw new Error(`brayer: ${orderId} is assigned to ${order.assignee}`);
    }
    const started = store.attempt.start({
      workOrderId: orderId,
      harness: session.harness,
      agent: identity,
      sessionRef: session.session,
    });
    if (!started.attempt) {
      throw new Error(`brayer: could not start attempt: ${started.reason}`);
    }
    return { order: started.order, attempt: started.attempt, resumed };
  }

  if (order.status === "running") {
    const attempt = store.attempt
      .list({ workOrderId: orderId, status: "running" })
      .find((row) => row.agent === identity);
    if (!attempt) throw new Error(`brayer: ${orderId} has no running attempt for ${identity}`);
    return { order, attempt, resumed: true };
  }

  throw new Error(`brayer: order ${orderId} is ${order.status}, not attachable`);
}

export function attachSession({ store, session, orderId }) {
  if (!store) throw new Error("brayer: store is required");
  if (!orderId) throw new Error("brayer: orderId is required");
  return claimOrResume({ store, session, orderId });
}

export function checkpointSession({
  store,
  session,
  orderId,
  attemptId,
  trigger = "idle",
  state,
  treeHash,
  summary = null,
  goal = null,
  confidence = null,
  resumeRecipe = null,
}) {
  const kind = CHECKPOINT_TRIGGERS[trigger];
  if (!kind) throw new Error(`brayer: unknown checkpoint trigger: ${trigger}`);
  const checkpoint = store.checkpoint.write({
    workOrderId: orderId,
    attemptId,
    kind,
    goal,
    state,
    summary,
    confidence,
    resumeRecipe,
    treeHash,
    actor: sessionIdentity(session),
  });
  return checkpoint;
}

export function attachEvidence({
  store,
  session,
  orderId,
  attemptId,
  kind,
  path = null,
  uri = null,
  sha256 = null,
  summary = null,
  command = null,
  exitCode = null,
  status = null,
  verifier = null,
}) {
  let resolvedUri = uri;
  let resolvedSha = sha256;
  if (path) {
    const stored = storeFile({ root: store.config.blobsPath, filePath: path });
    resolvedUri = stored.uri;
    resolvedSha = stored.sha256;
  }
  if (!resolvedUri || !resolvedSha) {
    throw new Error("brayer: evidence requires path or uri + sha256");
  }
  return store.evidence.attach({
    workOrderId: orderId,
    attemptId,
    kind,
    uri: resolvedUri,
    sha256: resolvedSha,
    summary,
    command,
    exitCode,
    status,
    verifier,
    actor: sessionIdentity(session),
  });
}

export function finishSession({
  store,
  session,
  attemptId,
  status = "finished",
  summary = null,
  tokensIn = 0,
  tokensOut = 0,
  cacheRead = 0,
  costUsd = 0,
  toolCalls = 0,
  error = null,
  checkpointId = null,
}) {
  sessionIdentity(session);
  return store.attempt.finish({
    attemptId,
    status,
    summary,
    tokensIn,
    tokensOut,
    cacheRead,
    costUsd,
    toolCalls,
    error,
    checkpointId,
  });
}

export function resumeSession({ store, session, orderId }) {
  const attached = attachSession({ store, session, orderId });
  return {
    ...attached,
    checkpoint: store.checkpoint.latest({ workOrderId: orderId }),
  };
}
