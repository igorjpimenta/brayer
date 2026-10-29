import { newAttemptId } from "../ids.js";
import { now } from "./util.js";
import { rowAttempt } from "./rows.js";

export function createAttemptApi({ db, insertEvent, orderApi, clearExpiry }) {
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

        const nextCheckpointId = checkpointId ?? attempt.checkpointId;
        db.prepare(`
          UPDATE attempts
             SET status=?, ended_at=?, tokens_in=?, tokens_out=?, cache_read=?, cost_usd=?,
                 tool_calls=?, error=?, checkpoint_id=?
           WHERE id=? AND status='running'
        `).run(status, t, tokensIn, tokensOut, cacheRead, costUsd, toolCalls, error, nextCheckpointId, attemptId);

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
        clearExpiry?.(attempt.workOrderId);
        return { attempt: attemptApi.get(attemptId), order: orderApi.get(attempt.workOrderId), reason: null };
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };

  return attemptApi;
}
