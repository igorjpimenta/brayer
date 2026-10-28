export function eventSessionID(event) {
  return event?.properties?.sessionID ?? event?.properties?.info?.id ?? null;
}

export function checkpointPayload({ trigger, event }) {
  return {
    trigger,
    state: {
      trigger,
      eventType: event?.type ?? null,
      error: event?.properties?.error?.message ?? null,
    },
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
