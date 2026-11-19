// identity.js — opencode can mutate tool args but not request _meta, so the
// brayer server accepts a whole agent+session pair as brayer_agent/
// brayer_session args (src/identity.js, args channel). The hook overwrites
// both unconditionally: a model-supplied pair must never survive. The harness
// is not an argument — the MCP connection declares it via X-Brayer-Harness.

export function isBrayerTool(name) {
  return typeof name === "string" && name.includes("brayer");
}

export function stampBrayerIdentity(input, output, { agent = null } = {}) {
  if (!isBrayerTool(input?.tool)) return false;
  output.args = output.args ?? {};
  if (agent) output.args.brayer_agent = agent;
  if (input?.sessionID) output.args.brayer_session = input.sessionID;
  return true;
}

// The claim lease only guards the claimed→attempt window. Opening the attempt
// in the same call collapses that window, so a working session cannot drift
// into a 30-minute lease expiry while it is still doing the work.
export function stampStartAttempt(input, output) {
  if (!isBrayerTool(input?.tool)) return false;
  if (!/order_(claim|next)$/.test(String(input.tool))) return false;
  output.args = output.args ?? {};
  output.args.start_attempt = true;
  return true;
}
