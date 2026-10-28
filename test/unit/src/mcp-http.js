import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createStore } from "../../../src/store.js";
import { startMcpHttpServer } from "../../../src/mcp.js";

test("serves MCP over HTTP behind bearer auth", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-http-"));
  const store = createStore({ dbPath: path.join(dir, "store.sqlite") });
  const server = await startMcpHttpServer({
    store,
    base: { harness: "test" },
    port: 0,
    bearer: "secret",
  });
  const port = server.address().port;
  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status, 200);

    const denied = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(denied.status, 401);

    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
      requestInit: { headers: { Authorization: "Bearer secret" } },
    });
    const client = new Client({ name: "brayer-test", version: "0.0.0" });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      assert.equal(tools.length, 15);
    } finally {
      await client.close();
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
