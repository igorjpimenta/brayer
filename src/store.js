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
    event: eventApi,
    insertEvent,
    close() { db.close(); },
  };
}
