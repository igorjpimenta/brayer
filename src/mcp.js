import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod/v4-mini";
import { createToolHandlers } from "./tools/index.js";
import { assertDeclaration, resolveIdentity } from "./identity.js";
import { VERSION } from "./version.js";

function errorResult(err) {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: String(err?.message ?? err) }) }],
    isError: true,
  };
}

export function createMcpServer({ store, base, logger } = {}) {
  const declared = assertDeclaration(base);
  const { TOOL_DEFS, handle } = createToolHandlers(store);
  const server = new McpServer({ name: "brayer", version: VERSION });

  for (const def of TOOL_DEFS) {
    server.registerTool(
      def.name,
      { description: def.description, inputSchema: z.object(def.shape) },
      async (args, extra) => {
        try {
          const identity = resolveIdentity({ meta: extra?._meta, args, base: declared });
          logger?.info?.(`brayer: ${def.name} from ${identity.harness}:${identity.agent}:${identity.session}`);
          const result = await handle(def.name, args, identity);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (err) {
          return errorResult(err);
        }
      }
    );
  }

  return server;
}

export async function startMcpServer({ store, base, logger } = {}) {
  const server = createMcpServer({ store, base, logger });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger?.info?.("brayer: MCP server connected on stdio");
  return server;
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a ?? ""));
  const bb = Buffer.from(String(b ?? ""));
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function startMcpHttpServer({
  store,
  base,
  port = store.config.httpPort,
  host = "127.0.0.1",
  bearer,
  logger,
} = {}) {
  if (!bearer) throw new Error("brayer: BRAYER_MCP_BEARER is required for HTTP");
  const server = http.createServer(async (req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname !== "/mcp") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ") || !safeEqual(auth.slice(7), bearer)) {
      res.writeHead(401, { "content-type": "application/json", "www-authenticate": "Bearer" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { allow: "POST", "content-type": "application/json" });
      res.end(JSON.stringify({ error: "method not allowed" }));
      return;
    }

    const mcp = createMcpServer({ store, base, logger });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    try {
      await mcp.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      logger?.warn?.(`brayer: HTTP MCP failed: ${err?.message ?? err}`);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null }));
      }
    } finally {
      res.on("close", () => {
        transport.close();
        mcp.close();
      });
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  logger?.info?.(`brayer: MCP HTTP listening on http://${host}:${server.address().port}/mcp`);
  return server;
}
