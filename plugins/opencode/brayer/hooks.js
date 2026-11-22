import { stampBrayerIdentity, stampStartAttempt } from "./identity.js";
import { buildReadyDigest } from "./digest.js";
import { createCapture } from "./capture.js";

// The V1 host form of the V2 setup behavior: same digest, same capture, same
// overwrite-unconditionally identity stamp. The V1 system transform fires per
// model request, so the digest is decided before the CLI is awaited to keep
// concurrent requests from double-injecting.
export function createBrayerHooks({ buildDigest = buildReadyDigest, makeCapture = createCapture } = {}) {
  const agents = new Map();
  const digestSessions = new Set();
  const brayerSessions = new Set();
  const capture = makeCapture();

  return {
    "chat.message": async (input) => {
      if (input?.sessionID && input?.agent) agents.set(input.sessionID, input.agent);
    },
    "chat.params": async (input) => {
      if (input?.sessionID && input?.agent) agents.set(input.sessionID, input.agent);
    },
    "experimental.chat.system.transform": async (input, output) => {
      const sessionID = input?.sessionID == null ? "*" : String(input.sessionID);
      if (digestSessions.has(sessionID)) return;
      digestSessions.add(sessionID);
      try {
        const digest = await buildDigest({ sessionID: sessionID === "*" ? null : sessionID });
        if (digest && Array.isArray(output.system)) output.system.push(digest);
      } catch {
        // The digest must never break the turn it rides on.
      }
    },
    "tool.execute.before": async (input, output) => {
      const stamped = stampBrayerIdentity(input, output, { agent: agents.get(input?.sessionID) ?? process.env.BRAYER_AGENT });
      if (stamped && input?.sessionID != null) brayerSessions.add(String(input.sessionID));
      stampStartAttempt(input, output);
    },
    "event": async (input) => {
      const event = input?.event;
      if (event?.type !== "session.idle") return;
      const sessionID = event?.properties?.sessionID ?? event?.data?.sessionID;
      if (!sessionID || !brayerSessions.has(String(sessionID))) return;
      try {
        await capture({ sessionID: String(sessionID) });
      } catch {
        // Capture is best-effort.
      }
    },
  };
}
