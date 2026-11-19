import { createStore } from "../store.js";
import { startMcpHttpServer, startMcpServer } from "../mcp.js";
import { startEventServer } from "../events-ws.js";
import { flagValue } from "./args.js";

export async function runServe({ rest, env, logger }) {
  const mcpIndex = rest.indexOf("--mcp");
  const transport = mcpIndex >= 0 ? rest[mcpIndex + 1] : null;
  if (transport) {
    const store = createStore({ dbPath: env.BRAYER_DB || undefined });
    if (transport === "stdio") {
      if (!env.BRAYER_HARNESS) throw new Error("brayer: BRAYER_HARNESS is required for stdio MCP");
      await startMcpServer({ store, base: { harness: env.BRAYER_HARNESS }, logger });
      return;
    }
    if (transport === "http") {
      if (!env.BRAYER_MCP_BEARER) throw new Error("brayer: BRAYER_MCP_BEARER is required for HTTP");
      const port = Number(flagValue(rest, "--port") ?? env.BRAYER_HTTP_PORT ?? 38293);
      const host = flagValue(rest, "--host") ?? "127.0.0.1";
      // No harness base crosses into HTTP minting: the header alone declares
      // each session's harness, so a shared server stays construction-agnostic.
      await startMcpHttpServer({
        store,
        port,
        host,
        bearer: env.BRAYER_MCP_BEARER,
        logger,
      });
      return;
    }
    throw new Error("brayer: serve --mcp supports stdio or http");
  }

  if (rest.includes("--ws")) {
    const store = createStore({ dbPath: env.BRAYER_DB || undefined });
    const port = flagValue(rest, "--port");
    startEventServer({ store, port: port ? Number(port) : undefined });
    return;
  }

  throw new Error("brayer: serve requires --mcp stdio or --ws");
}
