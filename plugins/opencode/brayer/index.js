import { createStore } from "@igorjpimenta/brayer/src/store.js";
import {
  attachSession,
  checkpointSession,
  resumeSession,
} from "@igorjpimenta/brayer/plugins/shared/contract.js";
import { stampBrayerIdentity } from "./identity.js";
import { checkpointPayload, eventSessionID, resumeContext } from "./session.js";

export { isBrayerTool, stampBrayerIdentity } from "./identity.js";

const TRIGGERS = {
  "session.idle": "idle",
  "session.compacted": "compaction",
  "session.error": "error",
};

export function createBrayerHooks({ store, orderId, worktree } = {}) {
  const agents = new Map();
  const resumed = new Set();

  const sessionFor = (sessionID) => {
    const agent = agents.get(sessionID);
    if (!agent || !sessionID) return null;
    return { harness: "opencode", agent, session: sessionID };
  };

  const hooks = {
    "chat.message": async (input) => {
      if (input?.sessionID && input?.agent) agents.set(input.sessionID, input.agent);
    },
    "tool.execute.before": async (input, output) => {
      stampBrayerIdentity(input, output, { agent: agents.get(input?.sessionID) });
    },
    dispose: async () => {
      store?.close();
    },
  };

  if (!store || !orderId) return hooks;

  hooks.event = async ({ event } = {}) => {
    const trigger = TRIGGERS[event?.type];
    if (!trigger) return;
    const sessionID = eventSessionID(event);
    const session = sessionFor(sessionID);
    if (!session) return;
    try {
      const attached = attachSession({ store, session, orderId });
      const payload = checkpointPayload({ trigger, event });
      checkpointSession({
        store,
        session,
        orderId,
        attemptId: attached.attempt.id,
        ...payload,
        treeHash: worktree ?? "unknown",
      });
    } catch {}
  };

  hooks["experimental.chat.system.transform"] = async (input, output) => {
    if (!input?.sessionID || resumed.has(input.sessionID)) return;
    const session = sessionFor(input.sessionID);
    if (!session) return;
    try {
      const resumed = resumeSession({ store, session, orderId });
      const context = resumeContext(resumed.checkpoint);
      if (context) {
        output.system.push(context);
        resumed.add(input.sessionID);
      }
    } catch {}
  };

  return hooks;
}

export default {
  id: "brayer",
  server: async (input, options = {}) => {
    const orderId = options.orderId ?? process.env.BRAYER_ORDER_ID ?? null;
    const store = orderId
      ? createStore({ dbPath: options.dbPath ?? process.env.BRAYER_DB ?? undefined })
      : null;
    return createBrayerHooks({
      store,
      orderId,
      worktree: options.worktree ?? input?.worktree ?? input?.directory,
    });
  },
};
