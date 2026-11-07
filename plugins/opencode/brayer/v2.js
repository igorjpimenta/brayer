// v2.js — OpenCode 2 entry for the brayer companion.
//
// V2 registers each hook on the domain that owns it instead of returning a
// hooks object, and the request context carries the agent on the session hook
// rather than on a chat event. The stamp itself is unchanged: the same
// overwrite-unconditionally rule applies, because a model-supplied pair must
// never survive either entry.

import { stampBrayerIdentity } from "./identity.js";

export async function setupBrayer(ctx) {
  // sessionID → agent, learned once per request. The context hook is the only
  // v2 surface that names the agent for a turn, and it runs immediately before
  // the model request that may call a brayer tool.
  const agents = new Map();

  await ctx.session.hook("context", (event) => {
    if (!event?.sessionID || !event?.agent) return;
    agents.set(String(event.sessionID), String(event.agent));
  });

  await ctx.tool.hook("execute.before", (event) => {
    if (!event || typeof event !== "object") return;
    const agent = agents.get(String(event.sessionID)) ?? process.env.BRAYER_AGENT ?? null;
    event.input = event.input && typeof event.input === "object" ? event.input : {};
    stampBrayerIdentity(
      { tool: event.tool, sessionID: event.sessionID },
      { args: event.input },
      { agent },
    );
  });

  return () => {};
}
