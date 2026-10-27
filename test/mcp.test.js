import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createStore } from "../src/store.js";
import { createMcpServer } from "../src/mcp.js";

async function withClient(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-mcp-"));
  const store = createStore({ dbPath: path.join(dir, "store.sqlite") });
  const server = createMcpServer({ store, base: { harness: "test" } });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "brayer-test", version: "0.0.0" });
  await client.connect(clientTransport);
  try {
    return await fn({ client, store });
  } finally {
    await client.close();
    await server.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

const identity = { brayer_agent: "worker", brayer_session: "s1" };

test("lists the order tools", () => withClient(async ({ client }) => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["brayer_attempt_finish", "brayer_attempt_get", "brayer_attempt_start", "brayer_order_claim", "brayer_order_create", "brayer_order_get", "brayer_order_heartbeat", "brayer_order_next"]);
}));

test("creates and reads an order over MCP", () => withClient(async ({ client }) => {
  const created = await client.callTool({
    name: "brayer_order_create",
    arguments: {
      ...identity,
      title: "Fix intake 500",
      goal: "The intake endpoint returns 200",
      acceptance: "POST /api/intake returns 200",
      approvalMode: "evidence",
    },
  });
  assert.equal(created.isError, undefined);
  const order = JSON.parse(created.content[0].text).order;
  assert.match(order.id, /^WO-/);

  const fetched = await client.callTool({
    name: "brayer_order_get",
    arguments: { ...identity, orderId: order.id },
  });
  const body = JSON.parse(fetched.content[0].text);
  assert.equal(body.order.id, order.id);
  assert.equal(body.events[0].kind, "order.created");
}));

test("claims a ready order over MCP", () => withClient(async ({ client }) => {
  const created = await client.callTool({
    name: "brayer_order_create",
    arguments: { ...identity, title: "ready task", goal: "do it", acceptance: "done", status: "ready" },
  });
  const order = JSON.parse(created.content[0].text).order;

  const claimed = await client.callTool({
    name: "brayer_order_claim",
    arguments: { ...identity, orderId: order.id, leaseSeconds: 60 },
  });
  const body = JSON.parse(claimed.content[0].text);
  assert.equal(body.claimed.status, "claimed");
  assert.equal(body.claimed.assignee, "test:worker:s1");
}));

test("refuses an unstamped call", () => withClient(async ({ client }) => {
  const res = await client.callTool({
    name: "brayer_order_create",
    arguments: { title: "x", goal: "y", acceptance: "z" },
  });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /agent must be stamped/);
}));
