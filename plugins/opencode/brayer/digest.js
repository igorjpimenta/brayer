// digest.js — the session-start ready-work injection. Memory MCPs converge on
// the same shape: deterministic trigger, bounded budget, silent failure, one
// injection per session. The digest is built from the brayer CLI so it works
// with any daemon transport; a CLI miss degrades to "no injection", never to
// a broken turn.

import { execFile } from "node:child_process";

const ACCEPTANCE_CHARS = 160;
const TITLE_CHARS = 80;
const MAX_CHARS = 4000;

function truncate(text, max) {
  const t = String(text ?? "").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

export function formatReadyDigest(orders, { limit = 5 } = {}) {
  const all = Array.isArray(orders) ? orders : [];
  const shown = all.slice(0, limit);
  if (!shown.length) return null;
  const header = [
    `Brayer: ${all.length} ready work order${all.length === 1 ? "" : "s"}`,
    shown.length < all.length ? ` (top ${shown.length} by priority)` : "",
    ". If one fits this session's task, claim it with brayer_order_claim — an attempt opens in the same call — and report through the Brayer tools. Otherwise ignore this note.",
  ].join("");
  const lines = shown.map((order) =>
    `- ${order.id} (p${order.priority ?? 50}) ${truncate(order.title ?? "(untitled)", TITLE_CHARS)} — ${truncate(order.acceptance, ACCEPTANCE_CHARS)}`);
  let text = [header, ...lines].join("\n");
  while (text.length > MAX_CHARS && lines.length > 1) {
    lines.pop();
    text = [header, ...lines, `… ${all.length - lines.length} more: run brayer order ready`].join("\n");
  }
  return text;
}

function brayerJson(args, { env, spawn, timeoutMs }) {
  return new Promise((resolve) => {
    spawn(env.BRAYER_BIN || "brayer", args, { timeout: timeoutMs }, (err, stdout) => {
      if (err) { resolve(null); return; }
      try {
        resolve(JSON.parse(String(stdout)));
      } catch {
        resolve(null);
      }
    });
  });
}

export async function buildReadyDigest({
  sessionID = null,
  env = process.env,
  spawn = execFile,
  timeoutMs = 2000,
} = {}) {
  if (env.BRAYER_DIGEST_DISABLE === "1") return null;
  const limit = Number(env.BRAYER_READY_LIMIT || 5) || 5;
  if (sessionID) {
    // A session already working an order must not see a ready-work digest.
    const running = await brayerJson(["attempt", "running", "--session", String(sessionID)], { env, spawn, timeoutMs });
    if (running?.attempt) return null;
  }
  const data = await brayerJson(["order", "ready", "--limit", String(limit)], { env, spawn, timeoutMs });
  return formatReadyDigest(data?.orders, { limit });
}
