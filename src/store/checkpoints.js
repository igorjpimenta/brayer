import { newCheckpointId } from "../ids.js";
import { now } from "./util.js";
import { rowCheckpoint } from "./rows.js";

export function createCheckpointApi({ db, insertEvent, attemptApi }) {
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

  return checkpointApi;
}
