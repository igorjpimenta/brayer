import { createStore } from "./store.js";
import { startMcpServer } from "./mcp.js";
import { startEventServer } from "./events-ws.js";
import { VERSION } from "./version.js";

const usage = `brayer ${VERSION}

Usage:
  brayer --version
  brayer serve --mcp stdio
  brayer serve --ws --port 38294
  brayer status [--json]

HTTP and the full inbox land in later stories.`;

function flagValue(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
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
