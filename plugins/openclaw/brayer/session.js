export function sessionFromContext(event, ctx) {
  const agent = ctx?.agentId ?? event?.agentId ?? null;
  const session = ctx?.sessionKey ?? ctx?.sessionId ?? ctx?.runId ?? event?.sessionId ?? event?.runId ?? null;
  if (!agent || !session) return null;
  return { harness: "openclaw", agent, session };
}

export function checkpointPayload({ trigger, event, workspaceDir }) {
  return {
    trigger,
    state: {
      trigger,
      success: event?.success ?? null,
      messageCount: Array.isArray(event?.messages) ? event.messages.length : null,
      durationMs: event?.durationMs ?? null,
    },
    treeHash: workspaceDir ?? "unknown",
  };
}

export function resumeContext(checkpoint) {
  if (!checkpoint) return null;
  return [
    `Brayer checkpoint ${checkpoint.id} for this order.`,
    `Summary: ${checkpoint.summary ?? "(none)"}`,
    `Tree: ${checkpoint.treeHash ?? "(none)"}`,
    `Resume: ${checkpoint.resumeRecipe ?? "(none)"}`,
    `State: ${JSON.stringify(checkpoint.state ?? {})}`,
  ].join("\n");
}
