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
const store = createStore({ dbPath: path.join(dir, "store.sqlite"), config: { claimWebhookUrl: "http://127.0.0.1:9/claimed" } });
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
      requestInit: { headers: { Authorization: "Bearer secret", "X-Brayer-Harness": "claude" } },
    });
    const client = new Client({ name: "brayer-test", version: "0.0.0" });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      assert.equal(tools.length, 17);
    } finally {
      await client.close();
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("mints one session per harness declaration", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-http-"));
const store = createStore({ dbPath: path.join(dir, "store.sqlite"), config: { claimWebhookUrl: "http://127.0.0.1:9/claimed" } });
  const server = await startMcpHttpServer({ store, port: 0, bearer: "secret" });
  const port = server.address().port;
  try {
    const harnessFor = async (harness) => {
      const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
        requestInit: { headers: { Authorization: "Bearer secret", "X-Brayer-Harness": harness } },
      });
      const client = new Client({ name: "brayer-test", version: "0.0.0" });
      await client.connect(transport);
      return { client, transport };
    };
    const claude = await harnessFor("claude");
    const codex = await harnessFor("codex");
    try {
    const created = await claude.client.callTool({
      name: "brayer_order_create",
      arguments: { title: "mint", goal: "g", acceptance: "a", status: "ready", brayer_agent: "probe", brayer_session: "s1" },
    });
    const orderId = JSON.parse(created.content[0].text).order.id;

    const claimed = await codex.client.callTool({
      name: "brayer_order_claim",
      arguments: { orderId, brayer_agent: "probe", brayer_session: "s1" },
    });
      const body = JSON.parse(claimed.content[0].text);
      assert.equal(body.claimed.status, "claimed");
      assert.equal(body.claimed.assignee, "codex:probe:s1");

      const refused = await claude.client.callTool({
        name: "brayer_order_heartbeat",
        arguments: { orderId, brayer_agent: "probe", brayer_session: "s1" },
      });
      assert.equal(JSON.parse(refused.content[0].text).order, null);
    } finally {
      await claude.client.close();
      await codex.client.close();
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("refuses a mint without X-Brayer-Harness even when env claims a harness", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-http-"));
  const store = createStore({ dbPath: path.join(dir, "store.sqlite"), config: { claimWebhookUrl: "http://127.0.0.1:9/claimed" } });
  const server = await startMcpHttpServer({ store, port: 0, bearer: "secret" });
  const port = server.address().port;
  try {
    const denied = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { Authorization: "Bearer secret", "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(denied.status, 400);

    // header mint ignores env; an empty header is the only 400 shape here
    const empty = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { Authorization: "Bearer secret", "X-Brayer-Harness": "   ", "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(empty.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("registers a wake target over loopback", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-http-"));
  const store = createStore({ dbPath: path.join(dir, "store.sqlite"), config: { claimWebhookUrl: "http://127.0.0.1:9/claimed" } });
  const server = await startMcpHttpServer({ store, port: 0, bearer: "secret", registerBearer: null });
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/brayer/webhooks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        harness: "opencode",
        url: "http://127.0.0.1:55123/api/brayer/claimed",
        bearer: "wake-secret",
      }),
    });
    assert.equal(res.status, 201);
    const target = store.webhook.get("opencode");
    assert.equal(target.url, "http://127.0.0.1:55123/api/brayer/claimed");
    assert.equal(target.bearer, "wake-secret");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("requires BRAYER_REGISTER_BEARER when configured", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-http-"));
  const store = createStore({ dbPath: path.join(dir, "store.sqlite"), config: { claimWebhookUrl: "http://127.0.0.1:9/claimed" } });
  const server = await startMcpHttpServer({ store, port: 0, bearer: "secret", registerBearer: "reg-secret" });
  const port = server.address().port;
  try {
    const denied = await fetch(`http://127.0.0.1:${port}/api/brayer/webhooks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ harness: "opencode", url: "http://127.0.0.1:55123/claimed" }),
    });
    assert.equal(denied.status, 401);

    const ok = await fetch(`http://127.0.0.1:${port}/api/brayer/webhooks`, {
      method: "POST",
      headers: { authorization: "Bearer reg-secret", "content-type": "application/json" },
      body: JSON.stringify({ harness: "opencode", url: "http://127.0.0.1:55123/claimed" }),
    });
    assert.equal(ok.status, 201);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
