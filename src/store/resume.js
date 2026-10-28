import { now } from "./util.js";

export function createResumeApi({ db, insertEvent, orderApi, checkpointApi }) {
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

  return resumeApi;
}
