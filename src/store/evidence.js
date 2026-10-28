import { EVIDENCE_KINDS } from "../schema.js";
import { newEvidenceId } from "../ids.js";
import { now } from "./util.js";
import { rowEvidence } from "./rows.js";

export function createEvidenceApi({ db, insertEvent, attemptApi }) {
  const evidenceApi = {
    get(id) {
      return rowEvidence(db.prepare("SELECT * FROM evidence WHERE id=?").get(id));
    },

    list({ workOrderId, attemptId } = {}) {
      const where = [];
      const args = [];
      if (workOrderId) { where.push("work_order_id=?"); args.push(workOrderId); }
      if (attemptId) { where.push("attempt_id=?"); args.push(attemptId); }
      const sql = `SELECT * FROM evidence${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at ASC, rowid ASC`;
      return db.prepare(sql).all(...args).map(rowEvidence);
    },

    attach({
      workOrderId,
      attemptId,
      kind,
      uri,
      sha256,
      summary = null,
      command = null,
      exitCode = null,
      status = null,
      verifier = null,
      actor = "system",
    } = {}) {
      if (!workOrderId) throw new Error("workOrderId is required");
      if (!attemptId) throw new Error("attemptId is required");
      if (!EVIDENCE_KINDS.includes(kind)) throw new Error(`invalid evidence kind: ${kind}`);
      if (!uri) throw new Error("uri is required");
      if (typeof sha256 !== "string" || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error("sha256 must be 64 lowercase hex characters");

      const attempt = attemptApi.get(attemptId);
      if (!attempt) throw new Error(`attempt not found: ${attemptId}`);
      if (attempt.workOrderId !== workOrderId) throw new Error("attempt does not belong to the order");
      if (attempt.status !== "running") throw new Error("evidence requires a running attempt");

      const t = now();
      const id = newEvidenceId();
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(`
          INSERT INTO evidence(id, work_order_id, attempt_id, kind, uri, sha256, summary, command, exit_code, status, verifier, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, workOrderId, attemptId, kind, uri, sha256, summary, command, exitCode, status, verifier, t);
        insertEvent({
          workOrderId, attemptId, fromStatus: "running", toStatus: "running", kind: "evidence.attached",
          actor, note: summary ?? kind, sessionRef: attempt.sessionRef, at: t,
        });
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
      return evidenceApi.get(id);
    },
  };

  return evidenceApi;
}
