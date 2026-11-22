// capture.js — auto checkpoint on session idle. Only sessions that touched a
// brayer tool are captured, throttled per session so a chatty session writes
// at most one checkpoint per interval. The CLI resolves the running attempt
// from the session ref; a miss degrades to a no-op.

import { execFile } from "node:child_process";

export function createCapture({
  env = process.env,
  spawn = execFile,
  minIntervalMs = Number(env.BRAYER_CAPTURE_MIN_MS || 300000),
} = {}) {
  const lastWrites = new Map();

  function writeCheckpoint(sessionID) {
    return new Promise((resolve) => {
      spawn(env.BRAYER_BIN || "brayer", ["checkpoint", "write", "--session", String(sessionID)], { timeout: 5000 }, (err, stdout) => {
        if (err) { resolve(null); return; }
        try {
          resolve(JSON.parse(String(stdout)));
        } catch {
          resolve(null);
        }
      });
    });
  }

  return async function capture({ sessionID } = {}) {
    if (!sessionID || env.BRAYER_CAPTURE_DISABLE === "1") return false;
    const at = Date.now();
    if (at - (lastWrites.get(sessionID) ?? 0) < minIntervalMs) return false;
    lastWrites.set(sessionID, at);
    const result = await writeCheckpoint(sessionID);
    return result?.written === true;
  };
}
