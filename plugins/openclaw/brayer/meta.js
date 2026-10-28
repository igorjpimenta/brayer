export function isBrayerTool(name) {
  return typeof name === "string" && name.includes("brayer");
}

export function buildBrayerMeta(event, ctx) {
  const toolName = event?.toolName ?? ctx?.toolName;
  if (!isBrayerTool(toolName)) return undefined;

  const agent = ctx?.agentId ?? event?.agentId ?? null;
  const session = ctx?.sessionKey ?? ctx?.sessionId ?? ctx?.runId ?? event?.sessionId ?? event?.runId ?? null;
  if (agent === null && session === null) return undefined;

  const params = event?.params ?? {};
  return {
    params: {
      ...params,
      _meta: {
        ...(params._meta ?? {}),
        brayer: { harness: "openclaw", agent, session },
      },
    },
  };
}
