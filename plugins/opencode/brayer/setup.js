// setup.js — the entry. Hosts read it from the default export; the legacy
// server() in index.js gives a V1 host the object-hook form of the same
// behavior. V2 registers each hook on the domain that owns it, and the agent
// arrives on the session context hook rather than a chat event. The stamp is
// unchanged from the V1 side: the same overwrite-unconditionally rule applies,
// because a model-supplied pair must never survive on either host.

import { stampBrayerIdentity, stampStartAttempt } from "./identity.js";

export async function setup(ctx) {
  // sessionID → agent, learned once per request. The context hook is the only
  // surface that names the agent for a turn, and it runs immediately before
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
    const stamped = { args: event.input };
    stampBrayerIdentity(
      { tool: event.tool, sessionID: event.sessionID },
      stamped,
      { agent },
    );
    stampStartAttempt({ tool: event.tool }, stamped);
    event.input = stamped.args;
  });

  return () => {};
}
