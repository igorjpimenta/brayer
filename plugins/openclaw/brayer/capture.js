// capture.js — openclaw auto-checkpoint for sessions working orders without a
// configured gateway orderId. Only sessions that touched a brayer tool are
// captured, throttled per session; the attempt is resolved from the session
// ref. Checkpoint shape (state, treeHash) matches the configured flow so
// resume and the adoption scorecard treat them the same.

import { checkpointSession } from "../../shared/contract.js";
import { checkpointPayload } from "./session.js";

export function createDiscoveryCapture({
  store: getStore,
  logger = null,
  workspaceDir = null,
  minIntervalMs = null,
  env = process.env,
} = {}) {
  const lastWrites = new Map();
  const minMs = minIntervalMs ?? Number(env.BRAYER_CAPTURE_MIN_MS || 300000);

  return function capture({ session, attempt } = {}) {
    if (!session || !attempt || env.BRAYER_CAPTURE_DISABLE === "1") return null;
    const at = Date.now();
    if (at - (lastWrites.get(session.session) ?? 0) < minMs) return null;
    lastWrites.set(session.session, at);
    try {
      return checkpointSession({
        store: getStore(),
        session,
        orderId: attempt.workOrderId,
        attemptId: attempt.id,
        ...checkpointPayload({ trigger: "idle", event: {}, workspaceDir }),
      });
    } catch (err) {
      logger?.warn?.(`brayer: capture failed: ${err?.message ?? err}`);
      return null;
    }
  };
}
