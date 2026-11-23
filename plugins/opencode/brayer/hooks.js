import { stampBrayerIdentity, stampStartAttempt } from "./identity.js";
import { buildReadyDigest } from "./digest.js";
import { createCapture } from "./capture.js";

// The V1 host form of the V2 setup behavior: same digest, same capture, same
// overwrite-unconditionally identity stamp.
//
// The digest rides on experimental.chat.messages.transform, NOT the system
// transform: on opencode 1.19.x the system transform fires but its
// output.system is discarded before the request is built (verified — even a
// full replacement of output.system never reaches the model), while a text
// part prepended to the first user message does. messages.transform has no
// sessionID on its input and does not fire for title-generation requests, so
// the dedupe keys on the first user message's text: stable across the turns
// of one session, and each turn's request carries the same first message.
export function createBrayerHooks({ buildDigest = buildReadyDigest, makeCapture = createCapture } = {}) {
  const agents = new Map();
  const digestTurns = new Set();
  const brayerSessions = new Set();
  const capture = makeCapture();
  let lastSession = null;

  return {
    "chat.message": async (input) => {
      if (input?.sessionID && input?.agent) agents.set(input.sessionID, input.agent);
      if (input?.sessionID) lastSession = String(input.sessionID);
    },
    "chat.params": async (input) => {
      if (input?.sessionID && input?.agent) agents.set(input.sessionID, input.agent);
      if (input?.sessionID) lastSession = String(input.sessionID);
    },
    "experimental.chat.messages.transform": async (input, output) => {
      const messages = output?.messages;
      const firstUser = Array.isArray(messages) ? messages.find((m) => m?.info?.role === "user") : null;
      const key = firstUser && Array.isArray(firstUser.parts)
        ? String(firstUser.parts.find((p) => p?.type === "text")?.text ?? "").slice(0, 512)
        : null;
      if (!key || digestTurns.has(key)) return;
      digestTurns.add(key);
      try {
        const digest = await buildDigest({ sessionID: lastSession });
        if (digest) firstUser.parts.unshift({ type: "text", text: digest });
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
