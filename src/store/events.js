import { now } from "./util.js";
import { rowEvent } from "./rows.js";

export function createEventApi({ db }) {
  function insertEvent({ workOrderId, attemptId = null, fromStatus = null, toStatus, kind, actor = "system", note = null, sessionRef = null, at = now() }) {
    const r = db.prepare(`
      INSERT INTO events(work_order_id, attempt_id, from_status, to_status, kind, actor, note, session_ref, at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(workOrderId, attemptId, fromStatus, toStatus, kind, actor, note, sessionRef, at);
    return Number(r.lastInsertRowid);
  }

  const eventApi = {
    list({ workOrderId, afterId = 0, limit = 200 } = {}) {
      const sql = workOrderId
        ? "SELECT * FROM events WHERE work_order_id=? AND id>? ORDER BY id ASC LIMIT ?"
        : "SELECT * FROM events WHERE id>? ORDER BY id ASC LIMIT ?";
      const args = workOrderId ? [workOrderId, afterId, limit] : [afterId, limit];
      return db.prepare(sql).all(...args).map(rowEvent);
    },
  };

  return { insertEvent, eventApi };
}
