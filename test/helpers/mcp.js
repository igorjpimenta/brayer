import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createStore } from "../../src/store.js";
import { createMcpServer } from "../../src/mcp.js";

export const identity = { brayer_agent: "worker", brayer_session: "s1" };

export async function withClient(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-mcp-"));
  const store = createStore({
    dbPath: path.join(dir, "store.sqlite"),
    config: { blobsPath: path.join(dir, "blobs") },
  });
  const server = createMcpServer({ store, base: { harness: "test" } });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "brayer-test", version: "0.0.0" });
  await client.connect(clientTransport);
  try {
    return await fn({ client, store, dir });
  } finally {
    await client.close();
    await server.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
