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
