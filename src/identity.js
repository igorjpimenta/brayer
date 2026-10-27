export function assertDeclaration(base = {}) {
  const harness = base.harness ?? process.env.BRAYER_HARNESS;
  if (typeof harness !== "string" || !harness.trim()) {
    throw new Error("brayer: BRAYER_HARNESS is required");
  }
  return { ...base, harness: harness.trim() };
}

export function resolveIdentity({ meta, args, base } = {}) {
  const declared = assertDeclaration(base);
  const stamped = meta?.brayer ?? {};

  const harness = stamped.harness ?? args?.brayer_harness ?? declared.harness;
  if (harness !== declared.harness) {
    throw new Error("brayer: harness mismatch");
  }

  const agent = stamped.agent ?? args?.brayer_agent;
  const session = stamped.session ?? args?.brayer_session;
  if (typeof agent !== "string" || !agent.trim()) {
    throw new Error("brayer: agent must be stamped on the call");
  }
  if (typeof session !== "string" || !session.trim()) {
    throw new Error("brayer: session must be stamped on the call");
  }

  return { harness: declared.harness, agent: agent.trim(), session: session.trim() };
}

export function identityKey(identity) {
  return `${identity.harness}:${identity.agent}:${identity.session}`;
}
