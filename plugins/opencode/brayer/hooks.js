import { stampBrayerIdentity } from "./identity.js";

export function createBrayerHooks() {
  const agents = new Map();

  return {
    "chat.message": async (input) => {
      if (input?.sessionID && input?.agent) agents.set(input.sessionID, input.agent);
    },
    "chat.params": async (input) => {
      if (input?.sessionID && input?.agent) agents.set(input.sessionID, input.agent);
    },
    "tool.execute.before": async (input, output) => {
      stampBrayerIdentity(input, output, { agent: agents.get(input?.sessionID) ?? process.env.BRAYER_AGENT });
    },
  };
}
