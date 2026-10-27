import { openDatabase } from "./db.js";
import { resolveConfig } from "./config.js";
import { newOrderId } from "./ids.js";
import { APPROVAL_MODES, ORDER_STATUSES } from "./schema.js";

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
    event: eventApi,
    insertEvent,
    close() { db.close(); },
  };
}
