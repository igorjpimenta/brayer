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
  if (!body.session || typeof body.session.agent !== "string" || !body.session.agent) return "session.agent required";
  if (typeof body.session.sessionKey !== "string" || !body.session.sessionKey) return "session.sessionKey required";
  return null;
}

export function claimSessionKey(orderId) {
  return `brayer-claim-${orderId}`;
}

export function claimMessage(body) {
  const order = body.order;
  const lines = [`Claimed Brayer order ${order.id}: ${order.title ?? "(untitled)"}`];
  if (order.acceptance) lines.push(`Acceptance: ${order.acceptance}`);
  lines.push(`Attach with BRAYER_ORDER_ID=${order.id} and report through the Brayer tools.`);
  return lines.join("\n");
}

export function registerClaimWebhook({ api, logger }) {
  if (typeof api?.registerHttpRoute !== "function") return false;
  const log = logger ?? api.logger;
  api.registerHttpRoute({
    path: "/api/brayer/claimed",
    auth: "plugin",
    match: "exact",
    handler: async (req, res) => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("allow", "POST");
        res.end(JSON.stringify({ error: "method not allowed" }));
        return;
      }
      const bearer = api.pluginConfig?.webhookBearer;
      if (typeof bearer !== "string" || bearer === "") {
        json(res, 503, { error: "brayer claim webhook not configured (webhookBearer)" });
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

      const orderId = body.order.id;
      const agent = body.session.agent;
      const message = claimMessage(body);
      const workflow = api.session?.workflow;
      let scheduled = false;
      if (workflow && typeof workflow.scheduleSessionTurn === "function") {
        try {
          await workflow.scheduleSessionTurn({
            sessionKey: claimSessionKey(orderId),
            message,
            agentId: agent,
            delayMs: 0,
            deleteAfterRun: true,
            tag: "brayer-claim",
            name: `brayer ${orderId}`,
          });
          scheduled = true;
        } catch (err) {
          log?.warn?.(`brayer: claim wake failed: ${err?.message ?? err}`);
        }
      }
      if (!scheduled) {
        log?.warn?.(`brayer: claim webhook received for ${orderId}, but no session schedule available`);
      }
      json(res, scheduled ? 200 : 202, { ok: true, scheduled, orderId });
    },
  });
  return true;
}
