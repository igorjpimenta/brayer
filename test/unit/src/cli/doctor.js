import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { runDoctor } from "../../../../src/cli/doctor.js";

function withTempDb(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-doctor-"));
  try {
    return fn(path.join(dir, "store.sqlite"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function healthServer(ok = true) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok }));
        return;
      }
      res.writeHead(404);
      res.end("{}");
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

test("doctor passes on a fresh db with a healthy mcp server and no webhooks is a fail", async () => {
  await withTempDb(async (dbPath) => {
    const server = await healthServer();
    try {
      const result = await runDoctor({
        rest: ["--url", `http://127.0.0.1:${server.address().port}`, "--json"],
        env: { BRAYER_DB: dbPath },
        logger: { log() {} },
      });
      const byName = Object.fromEntries(result.checks.map((c) => [c.name, c]));
      assert.equal(byName.database.ok, true);
      assert.equal(byName["mcp http"].ok, true);
      assert.equal(byName["claim webhooks"].ok, false);
      assert.match(byName["claim webhooks"].detail, /none registered/);
      assert.equal(result.ok, false);
    } finally {
      server.close();
    }
  });
});

test("doctor passes end to end with webhooks registered", async () => {
  await withTempDb(async (dbPath) => {
    const server = await healthServer();
    try {
      const { createStore } = await import("../../../../src/store.js");
      const store = createStore({ dbPath });
      store.webhook.upsert({ harness: "opencode", url: "http://127.0.0.1:61912/api/brayer/claimed" });
      store.close();

      const result = await runDoctor({
        rest: ["--url", `http://127.0.0.1:${server.address().port}`],
        env: { BRAYER_DB: dbPath },
        logger: { log() {} },
      });
      assert.equal(result.ok, true);
      const hooks = result.checks.find((c) => c.name === "claim webhooks");
      assert.match(hooks.detail, /opencode -> http:\/\/127\.0\.0\.1:61912/);
    } finally {
      server.close();
    }
  });
});

test("doctor fails when the mcp server is unreachable", async () => {
  await withTempDb(async (dbPath) => {
    const result = await runDoctor({
      rest: ["--url", "http://127.0.0.1:9"],
      env: { BRAYER_DB: dbPath },
      logger: { log() {} },
    });
    const mcp = result.checks.find((c) => c.name === "mcp http");
    assert.equal(mcp.ok, false);
  });
});
