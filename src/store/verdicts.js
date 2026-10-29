import { newVerdictId } from "../ids.js";
import { jsonOut, now } from "./util.js";
import { rowVerdict } from "./rows.js";

export function createVerdictApi({ db, insertEvent, orderApi, evidenceApi }) {
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
        const resolvedAttemptId = attemptId ?? db.prepare(
          "SELECT id FROM attempts WHERE work_order_id=? ORDER BY started_at DESC LIMIT 1"
        ).get(workOrderId)?.id ?? null;

        const nextStatus = decision === "approve" ? "approved"
          : decision === "reject" ? "rejected"
          : decision === "escalate" ? "blocked"
          : "ready";
        const id = newVerdictId();
        db.prepare(`
          INSERT INTO verdicts(id, work_order_id, attempt_id, decision, reason, actor, policy, evidence_ids, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, workOrderId, resolvedAttemptId, decision, reason, actor, policy, jsonOut(evidenceIds), t);
        db.prepare("UPDATE work_orders SET status=?, updated_at=? WHERE id=?").run(nextStatus, t, workOrderId);
        insertEvent({
          workOrderId, attemptId: resolvedAttemptId, fromStatus: order.status, toStatus: nextStatus, kind: "verdict.issued",
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

  return verdictApi;
}
