const DEFAULT_AGENT = "opencode";

export function isBrayerTool(name) {
  return typeof name === "string" && name.includes("brayer");
}

export function stampBrayerIdentity(input, output, env = process.env) {
  if (!isBrayerTool(input?.tool)) return false;
  output.args = output.args ?? {};
  if (!output.args.brayer_agent) output.args.brayer_agent = env.BRAYER_AGENT ?? DEFAULT_AGENT;
  if (!output.args.brayer_session) output.args.brayer_session = input.sessionID;
  return true;
}

export default {
  id: "brayer",
  server: async () => ({
    "tool.execute.before": async (input, output) => {
      stampBrayerIdentity(input, output);
    },
  }),
};
