// setup.js — the entry. Hosts read it from the default export; the legacy
// server() in index.js gives a V1 host the object-hook form of the same
// behavior. V2 registers each hook on the domain that owns it, and the agent
// arrives on the session context hook rather than a chat event. The stamp is
// unchanged from the V1 side: the same overwrite-unconditionally rule applies,
// because a model-supplied pair must never survive on either host.
//
// Beyond stamping, the plugin surfaces ready work proactively: the first
// context hook of a session injects a bounded ready-order digest into the
// system parts, and session idle writes an auto checkpoint for sessions that
// touched a brayer tool.

import { stampBrayerIdentity, stampStartAttempt, isBrayerTool } from "./identity.js";
import { buildReadyDigest } from "./digest.js";
import { createCapture } from "./capture.js";

export async function setup(ctx, { buildDigest = buildReadyDigest, makeCapture = createCapture } = {}) {
  // sessionID → agent, learned once per request. The context hook is the only
  // surface that names the agent for a turn, and it runs immediately before
  // the model request that may call a brayer tool.
  const agents = new Map();
  // One digest per session, decided before the CLI is awaited so concurrent
  // contexts for the same session cannot double-inject.
  const digestSessions = new Set();
  // Only sessions that touched a brayer tool are checkpoint candidates.
  const brayerSessions = new Set();
  const capture = makeCapture();

  if (typeof ctx.session?.hook === "function") {
    await ctx.session.hook("context", async (event) => {
      if (event?.sessionID && event?.agent) agents.set(String(event.sessionID), String(event.agent));
      const sessionID = event?.sessionID == null ? null : String(event.sessionID);
      if (sessionID === null || digestSessions.has(sessionID)) return;
      digestSessions.add(sessionID);
      try {
        const digest = await buildDigest({ sessionID });
        if (digest && Array.isArray(event.system)) event.system.push({ type: "text", text: digest });
      } catch {
        // The digest must never break the turn it rides on.
      }
    });
  }

  if (typeof ctx.tool?.hook === "function") {
    await ctx.tool.hook("execute.before", (event) => {
      if (!event || typeof event !== "object") return;
      const agent = agents.get(String(event.sessionID)) ?? process.env.BRAYER_AGENT ?? null;
      event.input = event.input && typeof event.input === "object" ? event.input : {};
      const stamped = { args: event.input };
      const isBrayer = stampBrayerIdentity(
        { tool: event.tool, sessionID: event.sessionID },
        stamped,
        { agent },
      );
      if (isBrayer && event.sessionID != null) brayerSessions.add(String(event.sessionID));
      stampStartAttempt({ tool: event.tool }, stamped);
      event.input = stamped.args;
    });
  }

  let abort = null;
  if (typeof ctx.event?.subscribe === "function") {
    abort = new AbortController();
    void (async () => {
      try {
        // await first: the real subscribe returns the stream synchronously,
        // but awaiting keeps promise-returning hosts and stubs compatible.
        const stream = await ctx.event.subscribe({ types: ["session.idle"], signal: abort.signal });
        for await (const event of stream) {
          const sessionID = event?.data?.sessionID ?? event?.properties?.sessionID ?? event?.sessionID;
          if (!sessionID || !brayerSessions.has(String(sessionID))) continue;
          try {
            await capture({ sessionID: String(sessionID) });
          } catch {
            // Capture is best-effort; a failed checkpoint is retried at the
            // next idle event after the throttle window.
          }
        }
      } catch {
        // Stream errors are non-fatal; the plugin keeps stamping.
      }
    })();
  }

  return () => abort?.abort();
}
