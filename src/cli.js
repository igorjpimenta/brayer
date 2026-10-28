import { createStore } from "./store.js";
import { startMcpServer } from "./mcp.js";
import { startEventServer } from "./events-ws.js";
import { VERSION } from "./version.js";
import { webhookConfig } from "./claim-webhook.js";

const usage = `brayer ${VERSION}

Usage:
  brayer --version
  brayer serve --mcp stdio
  brayer serve --ws --port 38294
  brayer status [--json]
  brayer webhook set --harness H --url U [--bearer B] [--timeout-ms N]
  brayer webhook list
  brayer webhook remove --harness H
  brayer webhook test --harness H

HTTP and the full inbox land in later stories.`;

function flagValue(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

function flagMap(args) {
  const out = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith("--") && args[i + 1] !== undefined) {
      out[args[i].slice(2)] = args[i + 1];
      i += 1;
    }
  }
  return out;
}

export function formatStatus(orders) {
  if (!orders.length) return "No work orders.";
  const rows = orders.map((o) => [
    o.id,
    o.status.padEnd(9),
    o.assignee ?? "-",
    String(o.attemptCount),
    o.title,
  ]);
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  return rows.map((r) => r.map((v, i) => (i === 4 ? v : v.padEnd(widths[i]))).join("  ")).join("\n");
}

export async function main(argv = process.argv.slice(2), { env = process.env, logger = console } = {}) {
  const [command, ...rest] = argv;

  if (command === "--version" || command === "-v") {
    console.log(VERSION);
    return;
  }
  if (!command || command === "--help" || command === "-h") {
    console.log(usage);
    return;
  }

  if (command === "status") {
    const store = createStore({ dbPath: env.BRAYER_DB || undefined });
    try {
      const orders = store.order.list({ limit: 100 });
      if (rest.includes("--json")) console.log(JSON.stringify({ orders }, null, 2));
      else console.log(formatStatus(orders));
    } finally {
      store.close();
    }
    return;
  }

  if (command === "webhook") {
    const [sub, ...webhookArgs] = rest;
    const values = flagMap(webhookArgs);
    const harness = values.harness;
    const store = createStore({ dbPath: env.BRAYER_DB || undefined });
    try {
      if (sub === "list") {
        const rows = store.webhook.list().map((row) => ({ ...row, bearer: row.bearer ? "<set>" : null }));
        console.log(JSON.stringify(rows, null, 2));
        return;
      }
      if (!["set", "remove", "test"].includes(sub)) {
        throw new Error("brayer: webhook requires set, list, remove or test");
      }
      if (!harness) throw new Error(`brayer: webhook ${sub} requires --harness`);
      if (sub === "remove") {
        if (!store.webhook.remove({ harness })) throw new Error(`brayer: no webhook for ${harness}`);
        console.log(JSON.stringify({ removed: harness }));
        return;
      }
      if (sub === "set") {
        if (!values.url) throw new Error("brayer: webhook set requires --url");
        const timeoutMs = values["timeout-ms"] !== undefined ? Number(values["timeout-ms"]) : null;
        const row = store.webhook.upsert({
          harness,
          url: values.url,
          bearer: values.bearer ?? null,
          timeoutMs,
        });
        console.log(JSON.stringify({ ...row, bearer: row.bearer ? "<set>" : null }, null, 2));
        return;
      }
      const hook = webhookConfig(store.config, harness, store.webhook.get(harness));
      if (!hook) throw new Error(`brayer: no webhook for ${harness}`);
      const headers = { "content-type": "application/json" };
      if (hook.bearer) headers.authorization = `Bearer ${hook.bearer}`;
      const res = await fetch(hook.url, {
        method: "POST",
        headers,
        body: JSON.stringify({ event: "webhook.test", at: Date.now(), harness }),
        signal: AbortSignal.timeout(hook.timeoutMs),
      });
      const text = await res.text();
      console.log(JSON.stringify({ ok: res.ok, status: res.status, body: text.slice(0, 500) }, null, 2));
      if (!res.ok) process.exitCode = 1;
      return;
    } finally {
      store.close();
    }
  }

  if (command === "serve") {
    const mcpIndex = rest.indexOf("--mcp");
    const transport = mcpIndex >= 0 ? rest[mcpIndex + 1] : null;
    if (transport) {
      if (transport !== "stdio") throw new Error("brayer: serve --mcp currently supports only stdio");
      if (!env.BRAYER_HARNESS) throw new Error("brayer: BRAYER_HARNESS is required for stdio");
      const store = createStore({ dbPath: env.BRAYER_DB || undefined });
      await startMcpServer({ store, base: { harness: env.BRAYER_HARNESS }, logger });
      return;
    }

    if (rest.includes("--ws")) {
      const store = createStore({ dbPath: env.BRAYER_DB || undefined });
      const port = flagValue(rest, "--port");
      startEventServer({ store, port: port ? Number(port) : undefined, logger });
      return;
    }

    throw new Error("brayer: serve requires --mcp stdio or --ws");
  }

  throw new Error(`brayer: ${command} is not implemented yet`);
}
