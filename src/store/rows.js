import { jsonIn } from "./util.js";

export function rowOrder(r) {
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    goal: r.goal,
    constraints: r.constraints,
    acceptance: r.acceptance,
    status: r.status,
    priority: r.priority,
    workspace: r.workspace,
    repo: r.repo,
    branch: r.branch,
    budgetTokens: r.budget_tokens,
    budgetUsd: r.budget_usd,
    modelPolicy: jsonIn(r.model_policy),
    approvalMode: r.approval_mode,
    parentId: r.parent_id,
    assignee: r.assignee,
    claimExpiresAt: r.claim_expires_at,
    leaseSeconds: r.lease_seconds,
    lastHeartbeat: r.last_heartbeat,
    attemptCount: r.attempt_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    closedAt: r.closed_at,
  };
}

export function rowAttempt(r) {
  if (!r) return null;
  return {
    id: r.id,
    workOrderId: r.work_order_id,
    harness: r.harness,
    agent: r.agent,
    sessionRef: r.session_ref,
    model: r.model,
    status: r.status,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    tokensIn: r.tokens_in,
    tokensOut: r.tokens_out,
    cacheRead: r.cache_read,
    costUsd: r.cost_usd,
    toolCalls: r.tool_calls,
    error: r.error,
    checkpointId: r.checkpoint_id,
  };
}

export function rowCheckpoint(r) {
  if (!r) return null;
  return {
    id: r.id,
    workOrderId: r.work_order_id,
    attemptId: r.attempt_id,
    kind: r.kind,
    goal: r.goal,
    state: jsonIn(r.state_json),
    summary: r.summary,
    confidence: r.confidence,
    resumeRecipe: r.resume_recipe,
    treeHash: r.tree_hash,
    createdAt: r.created_at,
  };
}

export function rowEvidence(r) {
  if (!r) return null;
  return {
    id: r.id,
    workOrderId: r.work_order_id,
    attemptId: r.attempt_id,
    kind: r.kind,
    uri: r.uri,
    sha256: r.sha256,
    summary: r.summary,
    command: r.command,
    exitCode: r.exit_code,
    status: r.status,
    verifier: r.verifier,
    createdAt: r.created_at,
  };
}

export function rowVerdict(r) {
  if (!r) return null;
  return {
    id: r.id,
    workOrderId: r.work_order_id,
    attemptId: r.attempt_id,
    decision: r.decision,
    reason: r.reason,
    actor: r.actor,
    policy: r.policy,
    evidenceIds: jsonIn(r.evidence_ids),
    createdAt: r.created_at,
  };
}

export function rowEvent(r) {
  if (!r) return null;
  return {
    id: r.id,
    workOrderId: r.work_order_id,
    attemptId: r.attempt_id,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    kind: r.kind,
    actor: r.actor,
    note: r.note,
    sessionRef: r.session_ref,
    at: r.at,
  };
}
