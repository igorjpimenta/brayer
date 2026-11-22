// digest.js — the session-start ready-work injection. Memory MCPs converge on
// the same shape: deterministic trigger, bounded budget, silent failure, one
// injection per session. The digest is built from the brayer CLI so it works
// with any daemon transport; a CLI miss degrades to "no injection", never to
// a broken turn.

import { execFile } from "node:child_process";
import { formatReadyDigest } from "../../shared/digest.js";

export { formatReadyDigest, ACCEPTANCE_CHARS, TITLE_CHARS, MAX_CHARS } from "../../shared/digest.js";

function brayerJson(args, { env, spawn, timeoutMs }) {
  return new Promise((resolve) => {
    spawn(env.BRAYER_BIN || "brayer", args, { timeout: timeoutMs }, (err, stdout) => {
      if (err) { resolve(null); return; }
      try {
        resolve(JSON.parse(String(stdout)));
      } catch {
        resolve(null);
      }
    });
  });
}

export async function buildReadyDigest({
  sessionID = null,
  env = process.env,
  spawn = execFile,
  timeoutMs = 2000,
} = {}) {
  if (env.BRAYER_DIGEST_DISABLE === "1") return null;
  const limit = Number(env.BRAYER_READY_LIMIT || 5) || 5;
  if (sessionID) {
    // A session already working an order must not see a ready-work digest.
    const running = await brayerJson(["attempt", "running", "--session", String(sessionID)], { env, spawn, timeoutMs });
    if (running?.attempt) return null;
  }
  const data = await brayerJson(["order", "ready", "--limit", String(limit)], { env, spawn, timeoutMs });
  return formatReadyDigest(data?.orders, { limit });
}
