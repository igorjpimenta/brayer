const DEFAULT_TIMEOUT_MS = 3000;

export function webhookConfig(cfg, harness = null, dbEntry = null) {
  if (dbEntry?.url) {
    return {
      url: dbEntry.url,
      bearer: dbEntry.bearer || null,
      timeoutMs: dbEntry.timeoutMs ?? cfg?.claimWebhookTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
  }
  const entry = harness ? cfg?.claimWebhooks?.[harness] : null;
  if (entry?.url) {
    return {
      url: entry.url,
      bearer: entry.bearer || null,
      timeoutMs: entry.timeoutMs ?? cfg?.claimWebhookTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
  }
  if (!cfg?.claimWebhookUrl) return null;
  return {
    url: cfg.claimWebhookUrl,
    bearer: cfg.claimWebhookBearer || null,
    timeoutMs: cfg.claimWebhookTimeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

export function sessionFromAgentId(agentId, sessionRef = null) {
  const [harness, agent, ...rest] = String(agentId).split(":");
  return {
    harness: harness || null,
    agent: agent || null,
    sessionKey: sessionRef ?? (rest.length ? rest.join(":") : null),
  };
}

export function claimPayload({ order, agentId, sessionRef, at = Date.now() }) {
  return {
    event: "order.claimed",
    at,
    order,
    session: sessionFromAgentId(agentId, sessionRef),
  };
}

export async function notifyClaim(cfg, payload, { logger = null, dbEntry = null } = {}) {
  const hook = webhookConfig(cfg, payload?.session?.harness ?? null, dbEntry);
  if (!hook) return { ok: false, reason: "disabled" };
  try {
    const headers = { "content-type": "application/json" };
    if (hook.bearer) headers.authorization = `Bearer ${hook.bearer}`;
    const res = await fetch(hook.url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(hook.timeoutMs),
    });
    if (!res.ok) {
      logger?.warn?.(`brayer: claim webhook ${hook.url} -> ${res.status}`);
      return { ok: false, reason: `http_${res.status}` };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    logger?.warn?.(`brayer: claim webhook ${hook.url} failed: ${err?.message ?? err}`);
    return { ok: false, reason: "error" };
  }
}
