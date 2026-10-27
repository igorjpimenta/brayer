import { openDatabase } from "./db.js";
import { resolveConfig } from "./config.js";
import { newOrderId, newAttemptId, newCheckpointId, newEvidenceId, newVerdictId } from "./ids.js";
import { APPROVAL_MODES, EVIDENCE_KINDS, ORDER_STATUSES } from "./schema.js";

function now() { return Date.now(); }
function jsonOut(v) { return v == null ? null : JSON.stringify(v); }
function jsonIn(v) { if (v == null) return null; try { return JSON.parse(v); } catch { return null; } }

function rowOrder(r) {
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
    winchTaskId: r.winch_task_id,
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

function rowAttempt(r) {
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

function rowCheckpoint(r) {
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

function rowEvidence(r) {
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

function rowVerdict(r) {
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

function rowEvent(r) {
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

export function createStore({ dbPath, logger, config } = {}) {
  const cfg = resolveConfig({ explicit: config ?? {} });
  const finalPath = dbPath || cfg.dbPath;
  const { sqlite: db } = openDatabase({ dbPath: finalPath, logger });

  function insertEvent({ workOrderId, attemptId = null, fromStatus = null, toStatus, kind, actor = "system", note = null, sessionRef = null, at = now() }) {
    const r = db.prepare(`
      INSERT INTO events(work_order_id, attempt_id, from_status, to_status, kind, actor, note, session_ref, at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(workOrderId, attemptId, fromStatus, toStatus, kind, actor, note, sessionRef, at);
    return Number(r.lastInsertRowid);
  }

  const orderApi = {
    create({
      id,
      title,
      goal,
      constraints = null,
      acceptance,
      status = "draft",
      priority = 50,
      workspace = null,
      repo = null,
      branch = null,
      budgetTokens = null,
      budgetUsd = null,
      modelPolicy = null,
      approvalMode = "human",
      parentId = null,
      winchTaskId = null,
      actor = "system",
    } = {}) {
      if (!title || !title.trim()) throw new Error("title is required");
      if (!goal || !goal.trim()) throw new Error("goal is required");
      if (!acceptance || !acceptance.trim()) throw new Error("acceptance is required");
      if (!ORDER_STATUSES.includes(status)) throw new Error(`invalid order status: ${status}`);
      if (!APPROVAL_MODES.includes(approvalMode)) throw new Error(`invalid approval mode: ${approvalMode}`);

      const orderId = id || newOrderId();
      const t = now();
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(`
          INSERT INTO work_orders(
            id, title, goal, constraints, acceptance, status, priority, workspace, repo, branch,
            budget_tokens, budget_usd, model_policy, approval_mode, parent_id, winch_task_id,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          orderId, title.trim(), goal.trim(), constraints, acceptance.trim(), status, priority,
          workspace, repo, branch, budgetTokens, budgetUsd, jsonOut(modelPolicy), approvalMode,
          parentId, winchTaskId, t, t
        );
        insertEvent({ workOrderId: orderId, toStatus: status, kind: "order.created", actor, note: "order created", at: t });
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
      return orderApi.get(orderId);
    },

    get(id) {
      return rowOrder(db.prepare("SELECT * FROM work_orders WHERE id=?").get(id));
    },

    list({ status, limit = 100 } = {}) {
      const sql = status
        ? "SELECT * FROM work_orders WHERE status=? ORDER BY priority DESC, created_at ASC LIMIT ?"
        : "SELECT * FROM work_orders ORDER BY priority DESC, created_at ASC LIMIT ?";
      const args = status ? [status, limit] : [limit];
      return db.prepare(sql).all(...args).map(rowOrder);
    },
  };


  const claimApi = {
    claimById({ id, agentId, sessionRef = null, leaseSeconds = cfg.leaseSeconds } = {}) {
      if (!id) throw new Error("order id is required");
      if (!agentId) throw new Error("agentId is required");
      const t = now();
      const expires = t + leaseSeconds * 1000;
      db.exec("BEGIN IMMEDIATE");
      try {
        const cur = db.prepare("SELECT status, assignee FROM work_orders WHERE id=?").get(id);
        if (!cur) { db.exec("ROLLBACK"); return { claimed: null, reason: "not_found" }; }
        if (cur.status !== "ready") { db.exec("ROLLBACK"); return { claimed: null, reason: "not_ready" }; }
        if (cur.assignee && cur.assignee !== agentId) { db.exec("ROLLBACK"); return { claimed: null, reason: "assigned_elsewhere" }; }

        const r = db.prepare(`
          UPDATE work_orders
             SET status='claimed', assignee=?, claim_expires_at=?, lease_seconds=?, last_heartbeat=?,
                 attempt_count=attempt_count+1, updated_at=?
           WHERE id=? AND status='ready' AND (assignee IS NULL OR assignee=?)
        `).run(agentId, expires, leaseSeconds, t, t, id, agentId);
        if (r.changes === 0) { db.exec("ROLLBACK"); return { claimed: null, reason: "raced" }; }

        insertEvent({
          workOrderId: id, fromStatus: "ready", toStatus: "claimed", kind: "order.claimed",
          actor: agentId, note: "claim", sessionRef, at: t,
        });
        db.exec("COMMIT");
        return { claimed: orderApi.get(id), reason: null };
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },

    claimNext({ agentId, sessionRef = null, leaseSeconds = cfg.leaseSeconds } = {}) {
      if (!agentId) throw new Error("agentId is required");
      const candidates = db.prepare(`
        SELECT id FROM work_orders
         WHERE status='ready' AND (assignee IS NULL OR assignee=?)
         ORDER BY priority DESC, created_at ASC
         LIMIT 10
      `).all(agentId);
      for (const row of candidates) {
        const res = claimApi.claimById({ id: row.id, agentId, sessionRef, leaseSeconds });
        if (res.claimed) return res;
      }
      return { claimed: null, reason: "empty" };
    },

    heartbeat({ id, agentId, sessionRef = null, leaseSeconds = cfg.leaseSeconds } = {}) {
      if (!id) throw new Error("order id is required");
      if (!agentId) throw new Error("agentId is required");
      const t = now();
      const expires = t + leaseSeconds * 1000;
      const r = db.prepare(`
        UPDATE work_orders
           SET claim_expires_at=?, lease_seconds=?, last_heartbeat=?, updated_at=?
         WHERE id=? AND status='claimed' AND assignee=?
      `).run(expires, leaseSeconds, t, t, id, agentId);
      return r.changes ? orderApi.get(id) : null;
    },

    release({ id, agentId, actor = "system", reason = "released" } = {}) {
      if (!id) throw new Error("order id is required");
      const t = now();
      db.exec("BEGIN IMMEDIATE");
      try {
        const r = db.prepare(`
          UPDATE work_orders
             SET status='ready', assignee=NULL, claim_expires_at=NULL, lease_seconds=NULL,
                 last_heartbeat=NULL, updated_at=?
           WHERE id=? AND status='claimed' AND (? IS NULL OR assignee=?)
        `).run(t, id, agentId ?? null, agentId ?? null);
        if (r.changes === 0) { db.exec("ROLLBACK"); return null; }
        insertEvent({
          workOrderId: id, fromStatus: "claimed", toStatus: "ready", kind: "order.released",
          actor, note: reason, at: t,
        });
        db.exec("COMMIT");
        return orderApi.get(id);
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },

    sweepExpired({ at = now(), maxAttempts = cfg.maxAttempts } = {}) {
      const expired = db.prepare(`
        SELECT id FROM work_orders
         WHERE status='claimed' AND claim_expires_at IS NOT NULL AND claim_expires_at < ?
      `).all(at);
      let released = 0;
      let blocked = 0;
      for (const row of expired) {
        db.exec("BEGIN IMMEDIATE");
        try {
          const cur = db.prepare("SELECT status, attempt_count FROM work_orders WHERE id=?").get(row.id);
          if (!cur || cur.status !== "claimed") { db.exec("ROLLBACK"); continue; }
          if (cur.attempt_count >= maxAttempts) {
            db.prepare(`
              UPDATE work_orders
                 SET status='blocked', assignee=NULL, claim_expires_at=NULL, lease_seconds=NULL,
                     last_heartbeat=NULL, updated_at=?
               WHERE id=? AND status='claimed'
            `).run(at, row.id);
            insertEvent({
              workOrderId: row.id, fromStatus: "claimed", toStatus: "blocked", kind: "order.blocked",
              actor: "system", note: `lease expired after ${cur.attempt_count} attempts`, at,
            });
            blocked += 1;
          } else {
            db.prepare(`
              UPDATE work_orders
                 SET status='ready', assignee=NULL, claim_expires_at=NULL, lease_seconds=NULL,
                     last_heartbeat=NULL, updated_at=?
               WHERE id=? AND status='claimed'
            `).run(at, row.id);
            insertEvent({
              workOrderId: row.id, fromStatus: "claimed", toStatus: "ready", kind: "order.released",
              actor: "system", note: "lease expired", at,
            });
            released += 1;
          }
          db.exec("COMMIT");
        } catch (err) {
          db.exec("ROLLBACK");
          throw err;
        }
      }
      return { released, blocked };
    },
  };


  const attemptApi = {
    get(id) {
      return rowAttempt(db.prepare("SELECT * FROM attempts WHERE id=?").get(id));
    },

    list({ workOrderId, status } = {}) {
      const where = [];
      const args = [];
      if (workOrderId) { where.push("work_order_id=?"); args.push(workOrderId); }
      if (status) { where.push("status=?"); args.push(status); }
      const sql = `SELECT * FROM attempts${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY started_at ASC`;
      return db.prepare(sql).all(...args).map(rowAttempt);
    },

    start({ workOrderId, harness, agent, sessionRef = null, model = null } = {}) {
      if (!workOrderId) throw new Error("workOrderId is required");
      if (!harness) throw new Error("harness is required");
      if (!agent) throw new Error("agent is required");
      const t = now();
      db.exec("BEGIN IMMEDIATE");
      try {
        const order = orderApi.get(workOrderId);
        if (!order) { db.exec("ROLLBACK"); return { attempt: null, order: null, reason: "not_found" }; }
        const live = db.prepare("SELECT id FROM attempts WHERE work_order_id=? AND status='running'").get(workOrderId);
        if (live) { db.exec("ROLLBACK"); return { attempt: rowAttempt(db.prepare("SELECT * FROM attempts WHERE id=?").get(live.id)), order, reason: "already_running" }; }
        if (order.status !== "claimed") { db.exec("ROLLBACK"); return { attempt: null, order, reason: "not_claimed" }; }
        if (order.assignee !== agent) { db.exec("ROLLBACK"); return { attempt: null, order, reason: "assigned_elsewhere" }; }

        const id = newAttemptId();
        db.prepare(`
          INSERT INTO attempts(id, work_order_id, harness, agent, session_ref, model, status, started_at)
          VALUES (?, ?, ?, ?, ?, ?, 'running', ?)
        `).run(id, workOrderId, harness, agent, sessionRef, model, t);
        db.prepare("UPDATE work_orders SET status='running', updated_at=? WHERE id=? AND status='claimed'").run(t, workOrderId);
        insertEvent({
          workOrderId, attemptId: id, fromStatus: "claimed", toStatus: "running", kind: "attempt.started",
          actor: agent, note: "attempt started", sessionRef, at: t,
        });
        db.exec("COMMIT");
        return { attempt: attemptApi.get(id), order: orderApi.get(workOrderId), reason: null };
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },

    finish({
      attemptId,
      status,
      summary = null,
      tokensIn = 0,
      tokensOut = 0,
      cacheRead = 0,
      costUsd = 0,
      toolCalls = 0,
      error = null,
      checkpointId = null,
    } = {}) {
      if (!attemptId) throw new Error("attemptId is required");
      if (status !== "finished" && status !== "failed") throw new Error("status must be finished or failed");
      const t = now();
      db.exec("BEGIN IMMEDIATE");
      try {
        const attempt = attemptApi.get(attemptId);
        if (!attempt) { db.exec("ROLLBACK"); return { attempt: null, order: null, reason: "not_found" }; }
        if (attempt.status !== "running") { db.exec("ROLLBACK"); return { attempt, order: orderApi.get(attempt.workOrderId), reason: "not_running" }; }

        db.prepare(`
          UPDATE attempts
             SET status=?, ended_at=?, tokens_in=?, tokens_out=?, cache_read=?, cost_usd=?,
                 tool_calls=?, error=?, checkpoint_id=?
           WHERE id=? AND status='running'
        `).run(status, t, tokensIn, tokensOut, cacheRead, costUsd, toolCalls, error, checkpointId, attemptId);

        const order = orderApi.get(attempt.workOrderId);
        const nextStatus = status === "finished" ? "review" : "ready";
        db.prepare(`
          UPDATE work_orders
             SET status=?, assignee=?, claim_expires_at=NULL, lease_seconds=NULL, last_heartbeat=NULL, updated_at=?
           WHERE id=? AND status='running'
        `).run(nextStatus, status === "finished" ? order.assignee : null, t, attempt.workOrderId);

        insertEvent({
          workOrderId: attempt.workOrderId, attemptId, fromStatus: "running", toStatus: nextStatus,
          kind: status === "finished" ? "attempt.finished" : "attempt.failed",
          actor: attempt.agent, note: summary ?? error ?? status, sessionRef: attempt.sessionRef, at: t,
        });
        db.exec("COMMIT");
        return { attempt: attemptApi.get(attemptId), order: orderApi.get(attempt.workOrderId), reason: null };
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };


  const checkpointApi = {
    get(id) {
      return rowCheckpoint(db.prepare("SELECT * FROM checkpoints WHERE id=?").get(id));
    },

    latest({ workOrderId, attemptId } = {}) {
      if (!workOrderId && !attemptId) throw new Error("workOrderId or attemptId is required");
      const sql = attemptId
        ? "SELECT * FROM checkpoints WHERE attempt_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1"
        : "SELECT * FROM checkpoints WHERE work_order_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1";
      return rowCheckpoint(db.prepare(sql).get(attemptId ?? workOrderId));
    },

    list({ workOrderId, attemptId } = {}) {
      const where = [];
      const args = [];
      if (workOrderId) { where.push("work_order_id=?"); args.push(workOrderId); }
      if (attemptId) { where.push("attempt_id=?"); args.push(attemptId); }
      const sql = `SELECT * FROM checkpoints${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at ASC, rowid ASC`;
      return db.prepare(sql).all(...args).map(rowCheckpoint);
    },

    write({
      workOrderId,
      attemptId,
      kind = "manual",
      goal = null,
      state,
      summary = null,
      confidence = null,
      resumeRecipe = null,
      treeHash,
      actor = "system",
    } = {}) {
      if (!workOrderId) throw new Error("workOrderId is required");
      if (!attemptId) throw new Error("attemptId is required");
      if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("state must be an object");
      if (typeof treeHash !== "string" || !treeHash.trim()) throw new Error("treeHash is required");
      if (confidence != null && (typeof confidence !== "number" || confidence < 0 || confidence > 1)) {
        throw new Error("confidence must be between 0 and 1");
      }

      const attempt = attemptApi.get(attemptId);
      if (!attempt) throw new Error(`attempt not found: ${attemptId}`);
      if (attempt.workOrderId !== workOrderId) throw new Error("attempt does not belong to the order");
      if (attempt.status !== "running") throw new Error("checkpoint requires a running attempt");

      const t = now();
      const id = newCheckpointId();
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(`
          INSERT INTO checkpoints(id, work_order_id, attempt_id, kind, goal, state_json, summary, confidence, resume_recipe, tree_hash, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, workOrderId, attemptId, kind, goal, JSON.stringify(state), summary, confidence, resumeRecipe, treeHash, t);
        db.prepare("UPDATE attempts SET checkpoint_id=? WHERE id=?").run(id, attemptId);
        insertEvent({
          workOrderId, attemptId, fromStatus: "running", toStatus: "running", kind: "checkpoint.written",
          actor, note: summary ?? kind, sessionRef: attempt.sessionRef, at: t,
        });
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
      return checkpointApi.get(id);
    },
  };


  const evidenceApi = {
    get(id) {
      return rowEvidence(db.prepare("SELECT * FROM evidence WHERE id=?").get(id));
    },

    list({ workOrderId, attemptId } = {}) {
      const where = [];
      const args = [];
      if (workOrderId) { where.push("work_order_id=?"); args.push(workOrderId); }
      if (attemptId) { where.push("attempt_id=?"); args.push(attemptId); }
      const sql = `SELECT * FROM evidence${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at ASC, rowid ASC`;
      return db.prepare(sql).all(...args).map(rowEvidence);
    },

    attach({
      workOrderId,
      attemptId,
      kind,
      uri,
      sha256,
      summary = null,
      command = null,
      exitCode = null,
      status = null,
      verifier = null,
      actor = "system",
    } = {}) {
      if (!workOrderId) throw new Error("workOrderId is required");
      if (!attemptId) throw new Error("attemptId is required");
      if (!EVIDENCE_KINDS.includes(kind)) throw new Error(`invalid evidence kind: ${kind}`);
      if (!uri) throw new Error("uri is required");
      if (typeof sha256 !== "string" || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error("sha256 must be 64 lowercase hex characters");

      const attempt = attemptApi.get(attemptId);
      if (!attempt) throw new Error(`attempt not found: ${attemptId}`);
      if (attempt.workOrderId !== workOrderId) throw new Error("attempt does not belong to the order");
      if (attempt.status !== "running") throw new Error("evidence requires a running attempt");

      const t = now();
      const id = newEvidenceId();
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(`
          INSERT INTO evidence(id, work_order_id, attempt_id, kind, uri, sha256, summary, command, exit_code, status, verifier, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, workOrderId, attemptId, kind, uri, sha256, summary, command, exitCode, status, verifier, t);
        insertEvent({
          workOrderId, attemptId, fromStatus: "running", toStatus: "running", kind: "evidence.attached",
          actor, note: summary ?? kind, sessionRef: attempt.sessionRef, at: t,
        });
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
      return evidenceApi.get(id);
    },
  };


  const verdictApi = {
    list({ workOrderId } = {}) {
      const sql = workOrderId
        ? "SELECT * FROM verdicts WHERE work_order_id=? ORDER BY created_at ASC, rowid ASC"
        : "SELECT * FROM verdicts ORDER BY created_at ASC, rowid ASC LIMIT 200";
      return db.prepare(sql).all(...(workOrderId ? [workOrderId] : [])).map(rowVerdict);
    },

    issue({
      workOrderId,
      attemptId = null,
      decision,
      reason = null,
      actor = "system",
      policy = null,
      evidenceIds = null,
    } = {}) {
      if (!workOrderId) throw new Error("workOrderId is required");
      if (!["approve", "reject", "escalate", "rollback"].includes(decision)) throw new Error(`invalid verdict decision: ${decision}`);
      const t = now();
      db.exec("BEGIN IMMEDIATE");
      try {
        const order = orderApi.get(workOrderId);
        if (!order) throw new Error(`order not found: ${workOrderId}`);
        if (order.status !== "review" && order.status !== "blocked") {
          throw new Error(`verdict requires review or blocked, got ${order.status}`);
        }
        if (decision === "approve" && evidenceApi.list({ workOrderId }).length === 0) {
          throw new Error("approve requires at least one evidence row");
        }

        const nextStatus = decision === "approve" ? "approved"
          : decision === "reject" ? "rejected"
          : decision === "escalate" ? "blocked"
          : "ready";
        const id = newVerdictId();
        db.prepare(`
          INSERT INTO verdicts(id, work_order_id, attempt_id, decision, reason, actor, policy, evidence_ids, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, workOrderId, attemptId, decision, reason, actor, policy, jsonOut(evidenceIds), t);
        db.prepare("UPDATE work_orders SET status=?, updated_at=? WHERE id=?").run(nextStatus, t, workOrderId);
        insertEvent({
          workOrderId, attemptId, fromStatus: order.status, toStatus: nextStatus, kind: "verdict.issued",
          actor, note: reason ?? decision, at: t,
        });
        db.exec("COMMIT");
        return { verdict: verdictApi.list({ workOrderId }).at(-1), order: orderApi.get(workOrderId) };
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };

  const resumeApi = {
    resume({ workOrderId, actor = "operator", reason = "resumed" } = {}) {
      if (!workOrderId) throw new Error("workOrderId is required");
      const t = now();
      db.exec("BEGIN IMMEDIATE");
      try {
        const order = orderApi.get(workOrderId);
        if (!order) throw new Error(`order not found: ${workOrderId}`);
        if (order.status !== "rejected" && order.status !== "blocked") {
          throw new Error(`resume requires rejected or blocked, got ${order.status}`);
        }
        db.prepare(`
          UPDATE work_orders
             SET status='ready', assignee=NULL, claim_expires_at=NULL, lease_seconds=NULL,
                 last_heartbeat=NULL, updated_at=?
           WHERE id=?
        `).run(t, workOrderId);
        insertEvent({
          workOrderId, fromStatus: order.status, toStatus: "ready", kind: "order.resumed",
          actor, note: reason, at: t,
        });
        db.exec("COMMIT");
        return {
          order: orderApi.get(workOrderId),
          checkpoint: checkpointApi.latest({ workOrderId }),
        };
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };

  const eventApi = {
    list({ workOrderId, afterId = 0, limit = 200 } = {}) {
      const sql = workOrderId
        ? "SELECT * FROM events WHERE work_order_id=? AND id>? ORDER BY id ASC LIMIT ?"
        : "SELECT * FROM events WHERE id>? ORDER BY id ASC LIMIT ?";
      const args = workOrderId ? [workOrderId, afterId, limit] : [afterId, limit];
      return db.prepare(sql).all(...args).map(rowEvent);
    },
  };

  return {
    db,
    config: cfg,
    order: orderApi,
    claim: claimApi,
    attempt: attemptApi,
    checkpoint: checkpointApi,
    evidence: evidenceApi,
    verdict: verdictApi,
    resume: resumeApi,
    event: eventApi,
    insertEvent,
    close() { db.close(); },
  };
}
