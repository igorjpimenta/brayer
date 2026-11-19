import http from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
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
          const metaKeys = extra?._meta ? Object.keys(extra._meta).sort().join(",") : "-";
          logger?.info?.(`brayer: ${def.name} from ${identity.harness}:${identity.agent}:${identity.session} via=${identity.via} metaKeys=${metaKeys}`);
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

function isLoopback(req) {
  const addr = req.socket?.remoteAddress ?? "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
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

  // Shared HTTP mint: one process serves every harness. The first request on
  // a session declares the harness via the X-Brayer-Harness header — set by
  // the harness's own client config, never by the model — and that session
  // keeps the declaration for its lifetime. Later session requests replay to
  // the same server; the header is only consulted at minting.
  const sessions = new Map();

  async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (!body.length) return undefined;
    return JSON.parse(body.toString("utf8"));
  }

  async function dispatch(req, res, entry) {
    const body = await readBody(req);
    await entry.transport.handleRequest(req, res, body);
  }

  async function handleRegistration(req, res) {
    if (req.method !== "POST") {
      res.writeHead(405, { allow: "POST", "content-type": "application/json" });
      res.end(JSON.stringify({ error: "method not allowed" }));
      return;
    }
    if (!isLoopback(req)) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "registration is loopback-only" }));
      return;
    }
    let body;
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid json body" }));
      return;
    }
    try {
      const target = store.webhook.upsert({
        harness: body?.harness,
        url: body?.url,
        bearer: body?.bearer ?? null,
        timeoutMs: body?.timeoutMs ?? null,
      });
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, harness: target.harness, url: target.url }));
    } catch (err) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(err?.message ?? err) }));
    }
  }

  const server = http.createServer(async (req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname === "/api/brayer/webhooks") {
      await handleRegistration(req, res);
      return;
    }
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

    const sid = req.headers["mcp-session-id"];
    if (typeof sid === "string" && sessions.has(sid)) {
      try {
        await dispatch(req, res, sessions.get(sid));
      } catch (err) {
        logger?.warn?.(`brayer: HTTP MCP failed: ${err?.message ?? err}`);
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null }));
        }
      }
      return;
    }

    // New session: read the declared harness, refuse an empty one, then mint
    // the session-scoped server and register it by response header.
    const header = req.headers["x-brayer-harness"];
    const headerValue = Array.isArray(header) ? header[0] : header;
    let minted;
    try {
      minted = assertDeclaration({ harness: headerValue });
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "missing X-Brayer-Harness" }));
      return;
    }
    const mcp = createMcpServer({ store, base: minted, logger });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => sessions.set(id, { server: mcp, transport }),
    });
    transport.onclose = () => {
      for (const [id, entry] of sessions) {
        if (entry.transport === transport) sessions.delete(id);
      }
    };
    try {
      await mcp.connect(transport);
      await dispatch(req, res, { transport });
    } catch (err) {
      mcp.close();
      logger?.warn?.(`brayer: HTTP MCP failed: ${err?.message ?? err}`);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null }));
      }
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  logger?.info?.(`brayer: MCP HTTP listening on http://${host}:${server.address().port}/mcp`);
  return server;
}
