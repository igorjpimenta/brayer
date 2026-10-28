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
