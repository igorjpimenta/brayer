import { now } from "./util.js";

export function createClaimApi({ db, cfg, insertEvent, orderApi }) {
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

  return claimApi;
}
