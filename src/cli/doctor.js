// doctor.js — core wiring check: database, MCP HTTP server, claim webhooks.
// Harness-specific knowledge (which config file, which plugin is loaded)
// lives in each adapter's own doctor; this only checks what belongs to core.

import { createStore } from "../store.js";
import { DEFAULTS } from "../config.js";
import { flagValue } from "./args.js";

async function healthCheck(url) {
  if (!url) return { name: "mcp http", ok: true, detail: "skipped (no --url)" };
  try {
    const res = await fetch(new URL("/health", url), { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return { name: "mcp http", ok: false, detail: `${url} -> ${res.status}` };
    const body = await res.json();
    return { name: "mcp http", ok: body?.ok === true, detail: `${url} -> ${JSON.stringify(body)}` };
  } catch (err) {
    return { name: "mcp http", ok: false, detail: `${url}: ${err?.message ?? err}` };
  }
}

export async function runDoctor({ rest = [], env = process.env, logger = console } = {}) {
  const url = flagValue(rest, "--url") ?? (env.BRAYER_HTTP_PORT ? `http://127.0.0.1:${env.BRAYER_HTTP_PORT}` : `http://127.0.0.1:${DEFAULTS.httpPort}`);
  const checks = [];

  let store;
  try {
    store = createStore({ dbPath: env.BRAYER_DB || undefined });
    const count = store.order.list().length;
    checks.push({ name: "database", ok: true, detail: `${env.BRAYER_DB ?? DEFAULTS.dbPath} (${count} orders)` });
  } catch (err) {
    checks.push({ name: "database", ok: false, detail: `${env.BRAYER_DB ?? DEFAULTS.dbPath}: ${err?.message ?? err}` });
  }

  const hooks = store
    ? store.webhook.list()
    : [];
  checks.push({
    name: "claim webhooks",
    ok: hooks.length > 0,
    detail: hooks.length
      ? hooks.map((h) => `${h.harness} -> ${h.url}`).join(", ")
      : "none registered — claims stay in the queue until a harness registers",
  });
  store?.close();

  checks.push(await healthCheck(url));

  if (rest.includes("--json")) {
    console.log(JSON.stringify({ url, checks }, null, 2));
  } else {
    for (const check of checks) logger.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name.padEnd(16)} ${check.detail}`);
  }
  const ok = checks.every((check) => check.ok);
  return { url, checks, ok };
}
