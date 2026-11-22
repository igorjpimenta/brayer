// digest.js — openclaw side of the session-start ready-work injection. The
// gateway process owns the store directly, so no CLI spawn is needed: query,
// format through the shared formatter, skip when the session is already
// working an attempt.

import { formatReadyDigest } from "../../shared/digest.js";

export function readyDigest({ store, session = null, limit = 5, env = process.env } = {}) {
  if (!store) return null;
  if (env.BRAYER_DIGEST_DISABLE === "1") return null;
  const max = Number(env.BRAYER_READY_LIMIT || limit) || limit;
  if (session && store.attempt.forSession(session)) return null;
  const orders = store.order.list({ status: "ready", limit: max });
  return formatReadyDigest(orders, { limit: max });
}
