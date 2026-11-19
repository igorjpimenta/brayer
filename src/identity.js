// A usable layer names something: non-empty. No name is blocked here — a
// declared harness only has to be deliverable, which the claim gate checks
// against the register of wake routes (webhook_targets / claimWebhooks) at
// claim time, not by guessing meanings from the name.
function isUsableLayer(v) {
  return typeof v === "string" && v.trim() !== "";
}

// The declaration arrives only from the caller side — never from process env.
// serve() injects BRAYER_HARNESS as the stdio base (one-to-one pipe); the
// shared HTTP mint passes the X-Brayer-Harness header at session creation.
// Keeping the env read out of here is what stops a streaming session from
// ever minting a construction-time harness. Agent and session are never
// declared: they arrive per call, stamped by the calling harness's plugin.
export function assertDeclaration(base = {}) {
  const harness = base?.harness;
  if (typeof harness !== "string" || !harness.trim()) {
    throw new Error("brayer: harness must be declared (BRAYER_HARNESS env for stdio serve, X-Brayer-Harness header for HTTP)");
  }
  return { ...base, harness: harness.trim() };
}

export function resolveIdentity({ meta, args, base } = {}) {
  const declared = assertDeclaration(base);
  const stamped = meta?.brayer ?? {};

  // Whole pairs only: a _meta half never splices with an args half, so no
  // call can assemble an identity across trust channels.
  const usable = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const mAgent = usable(stamped.agent);
  const mSession = usable(stamped.session);
  const aAgent = usable(args?.brayer_agent);
  const aSession = usable(args?.brayer_session);
  const pair =
    mAgent && mSession
      ? { agent: mAgent, session: mSession, via: "meta" }
      : aAgent && aSession
        ? { agent: aAgent, session: aSession, via: "args" }
        : null;
  if (!pair) {
    const hint = "Install @igorjpimenta/brayer-opencode (or the matching harness plugin) so identity is stamped automatically, or pass both brayer_agent and brayer_session.";
    if ((mAgent || aAgent) && (mSession || aSession)) {
      throw new Error(`brayer: refused caller identity (halves in different channels — pairs never splice). ${hint}`);
    }
    const bad = [];
    if (!mAgent && !aAgent) bad.push("agent");
    if (!mSession && !aSession) bad.push("session");
    throw new Error(`brayer: ${bad.join(" and ")} must be stamped on the call. ${hint}`);
  }

  return { harness: declared.harness, agent: pair.agent, session: pair.session, via: pair.via };
}

export function identityKey(identity) {
  return `${identity.harness}:${identity.agent}:${identity.session}`;
}
