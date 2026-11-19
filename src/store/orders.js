import { newOrderId } from "../ids.js";
import { APPROVAL_MODES, ORDER_STATUSES } from "../schema.js";
import { jsonOut, now } from "./util.js";
import { rowOrder } from "./rows.js";

export function createOrderApi({ db, insertEvent }) {
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
            budget_tokens, budget_usd, model_policy, approval_mode, parent_id,
            created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          orderId, title.trim(), goal.trim(), constraints, acceptance.trim(), status, priority,
          workspace, repo, branch, budgetTokens, budgetUsd, jsonOut(modelPolicy), approvalMode,
          parentId, t, t
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

    cancel({ id, actor = "operator", reason = "cancelled" } = {}) {
      if (!id) throw new Error("order id is required");
      const t = now();
      db.exec("BEGIN IMMEDIATE");
      try {
        const cur = rowOrder(db.prepare("SELECT * FROM work_orders WHERE id=?").get(id));
        if (!cur) throw new Error(`order not found: ${id}`);
        if (cur.status === "cancelled") { db.exec("ROLLBACK"); return { order: cur, changed: false }; }
        if (cur.status === "running") {
          throw new Error("cannot cancel a running attempt — finish or fail the attempt first");
        }
        if (["approved", "rejected", "done"].includes(cur.status)) {
          throw new Error(`cannot cancel a ${cur.status} order`);
        }
        db.prepare(`
          UPDATE work_orders
             SET status='cancelled', assignee=NULL, claim_expires_at=NULL, lease_seconds=NULL,
                 last_heartbeat=NULL, closed_at=?, updated_at=?
           WHERE id=?
        `).run(t, t, id);
        insertEvent({
          workOrderId: id, fromStatus: cur.status, toStatus: "cancelled", kind: "order.cancelled",
          actor, note: reason, at: t,
        });
        db.exec("COMMIT");
        return { order: orderApi.get(id), changed: true };
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },

    list({ status, limit = 100 } = {}) {
      const sql = status
        ? "SELECT * FROM work_orders WHERE status=? ORDER BY priority DESC, created_at ASC LIMIT ?"
        : "SELECT * FROM work_orders ORDER BY priority DESC, created_at ASC LIMIT ?";
      const args = status ? [status, limit] : [limit];
      return db.prepare(sql).all(...args).map(rowOrder);
    },
  };

  return orderApi;
}
