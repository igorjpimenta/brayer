import http from "node:http";
import { timingSafeEqual } from "node:crypto";

const MAX_BODY_BYTES = 1024 * 1024;

function safeEqual(a, b) {
  const ab = Buffer.from(String(a ?? ""));
  const bb = Buffer.from(String(b ?? ""));
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

async function readJson(req, res) {
  let size = 0;
  let raw = "";
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      res.statusCode = 413;
      res.end(JSON.stringify({ error: "body too large" }));
      return undefined;
    }
    raw += chunk;
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "invalid json body" }));
    return undefined;
  }
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

export function claimError(body) {
  if (!body || typeof body !== "object") return "body must be an object";
  if (body.event === "webhook.test") return null;
  if (body.event !== "order.claimed") return `unsupported event ${JSON.stringify(body.event)}`;
  if (!body.order || typeof body.order.id !== "string" || !body.order.id) return "order.id required";
  if (!body.session || typeof body.session.sessionKey !== "string" || !body.session.sessionKey) {
    return "session.sessionKey required";
  }
  return null;
}

export function claimMessage(body) {
  const order = body.order;
  const lines = [`Claimed Brayer order ${order.id}: ${order.title ?? "(untitled)"}`];
  if (order.acceptance) lines.push(`Acceptance: ${order.acceptance}`);
  lines.push(`Attach with BRAYER_ORDER_ID=${order.id} and report through the Brayer tools.`);
  return lines.join("\n");
}

export function createWakeHandler({ prompt, bearer, logger } = {}) {
  return async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("allow", "POST");
      res.end(JSON.stringify({ error: "method not allowed" }));
      return;
    }
    if (!bearer) {
      json(res, 503, { error: "brayer wake not configured (BRAYER_WAKE_BEARER)" });
      return;
    }
    const auth = req.headers?.authorization ?? "";
    if (!auth.startsWith("Bearer ") || !safeEqual(auth.slice(7), bearer)) {
      json(res, 401, { error: "unauthorized" });
      return;
    }
    const body = await readJson(req, res);
    if (body === undefined) return;
    const shapeErr = claimError(body);
    if (shapeErr) {
      json(res, 400, { error: shapeErr });
      return;
    }
    if (body.event === "webhook.test") {
      json(res, 200, { ok: true, test: true });
      return;
    }
    try {
      await prompt(body.session.sessionKey, claimMessage(body));
      json(res, 200, { ok: true, sessionKey: body.session.sessionKey });
    } catch (err) {
      logger?.warn?.(`brayer wake: ${err?.message ?? err}`);
      json(res, 502, { error: "wake failed" });
    }
  };
}

export function createWakeServer(options = {}) {
  return http.createServer(createWakeHandler(options));
}

export async function registerWakeTarget({
  registerUrl,
  harness = "opencode",
  url,
  bearer = null,
  timeoutMs = 3000,
  attempts = 5,
  retryDelayMs = 500,
  logger = null,
} = {}) {
  if (!registerUrl) return { ok: false, reason: "disabled" };
  const endpoint = `${String(registerUrl).replace(/\/+$/, "")}/api/brayer/webhooks`;
  const headers = { "content-type": "application/json" };
  let last = { ok: false, reason: "error" };
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ harness, url, bearer }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return { ok: true, status: res.status };
      last = { ok: false, reason: `http_${res.status}` };
      if (res.status < 500) break;
    } catch {
      last = { ok: false, reason: "error" };
    }
    if (i + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
  logger?.warn?.(`brayer wake: register ${endpoint} failed (${last.reason})`);
  return last;
}

export async function startWakeServer({
  port,
  bearer = process.env.BRAYER_WAKE_BEARER,
  baseUrl = process.env.BRAYER_OPENCODE_URL ?? "http://127.0.0.1:4096",
  harness = process.env.BRAYER_WAKE_HARNESS ?? "opencode",
  registerUrl = process.env.BRAYER_REGISTER_URL
    ?? `http://127.0.0.1:${process.env.BRAYER_HTTP_PORT ?? 39293}`,
  logger = console,
} = {}) {
  if (!bearer) throw new Error("brayer wake: BRAYER_WAKE_BEARER is required");
  const resolvedPort = port ?? (process.env.BRAYER_WAKE_PORT ? Number(process.env.BRAYER_WAKE_PORT) : 0);
  if (!Number.isInteger(resolvedPort) || resolvedPort < 0) throw new Error("brayer wake: port must be a non-negative integer");
  const { createOpencodeClient } = await import("@opencode-ai/sdk");
  const client = createOpencodeClient({ baseUrl });
  const server = createWakeServer({
    bearer,
    logger,
    prompt: (sessionID, text) =>
      client.session.prompt({
        path: { id: sessionID },
        body: { parts: [{ type: "text", text }] },
      }),
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(resolvedPort, "127.0.0.1", resolve);
  });
  const actualPort = server.address()?.port ?? resolvedPort;
  const wakeUrl = `http://127.0.0.1:${actualPort}/api/brayer/claimed`;
  logger?.info?.(`brayer wake: listening on ${wakeUrl}`);
  const registered = await registerWakeTarget({
    registerUrl,
    harness,
    url: wakeUrl,
    bearer,
    logger,
  });
  if (registered.ok) {
    logger?.info?.(`brayer wake: registered ${harness} at ${wakeUrl}`);
  } else {
    logger?.warn?.(
      `brayer wake: not registered (${registered.reason}); register manually: ` +
      `brayer webhook set --harness ${harness} --url ${wakeUrl} --bearer <bearer>`
    );
  }
  return server;
}
