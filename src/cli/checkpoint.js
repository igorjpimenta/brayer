import { createHash } from "node:crypto";
import { createStore } from "../store.js";
import { flagMap } from "./args.js";

// Auto checkpoints written by harness plugins. The attempt is resolved from
// the session ref, so the plugin only needs its sessionID — no order or
// attempt ids cross the process boundary. The tree hash pins the checkpoint
// state itself; unlike a workspace tree hash it is a content hash of `state`.
export async function runCheckpoint({ rest = [], env = process.env, logger = console } = {}) {
  const [sub, ...checkpointArgs] = rest;
  const values = flagMap(checkpointArgs);
  const store = createStore({ dbPath: env.BRAYER_DB || undefined });
  try {
    if (sub !== "write") throw new Error("brayer: checkpoint requires write");
    if (!values.session) throw new Error("brayer: checkpoint write requires --session");

    const attempt = store.attempt.forSession(values.session);
    if (!attempt) {
      const result = { written: false, reason: "no_running_attempt" };
      console.log(JSON.stringify(result, null, 2));
      return result;
    }

    let state;
    if (values.state !== undefined) {
      try {
        state = JSON.parse(values.state);
      } catch {
        throw new Error("brayer: --state must be a JSON object");
      }
    } else {
      state = { source: "brayer-opencode", session: values.session, capturedAt: new Date().toISOString() };
    }
    if (!state || typeof state !== "object" || Array.isArray(state)) {
      throw new Error("brayer: --state must be a JSON object");
    }

    const treeHash = createHash("sha256").update(JSON.stringify(state)).digest("hex");
    const checkpoint = store.checkpoint.write({
      workOrderId: attempt.workOrderId,
      attemptId: attempt.id,
      kind: values.kind ?? "auto",
      summary: values.summary ?? null,
      state,
      treeHash,
      actor: attempt.agent,
    });
    const result = { written: true, checkpointId: checkpoint.id };
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    store.close();
  }
}
