export function isBrayerTool(name) {
  return typeof name === "string" && name.includes("brayer");
}

export function stampBrayerIdentity(input, output, { agent = null } = {}) {
  if (!isBrayerTool(input?.tool)) return false;
  output.args = output.args ?? {};
  if (!output.args.brayer_agent && agent) output.args.brayer_agent = agent;
  if (!output.args.brayer_session) output.args.brayer_session = input.sessionID;
  return true;
}

export function createBrayerHooks() {
  const agents = new Map();

  return {
    "chat.message": async (input) => {
      if (input?.sessionID && input?.agent) agents.set(input.sessionID, input.agent);
    },
    "tool.execute.before": async (input, output) => {
      stampBrayerIdentity(input, output, { agent: agents.get(input?.sessionID) });
    },
  };
}

export default {
  id: "brayer",
  server: async () => createBrayerHooks(),
};
