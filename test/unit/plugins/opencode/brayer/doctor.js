import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { parseJsonc, runDoctor } from "../../../../../plugins/opencode/brayer/doctor.js";

async function withDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-doctor-"));
  try {
    return await fn(dir);
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

function configFile(dir, { plugin = true, mcp = true } = {}) {
  const file = path.join(dir, "opencode.jsonc");
  writeFileSync(file, `{
    // identity plugin and remote MCP
    "plugin": [${plugin ? '"file:///opt/brayer-opencode/index.js"' : ""}],
    "mcp": {${mcp ? '"brayer": { "type": "remote", "url": "http://127.0.0.1:38295/mcp" }' : ""}}
  }`);
  return file;
}

test("parses jsonc without eating // inside strings", () => {
  const parsed = parseJsonc(`{
    // comment
    "url": "http://127.0.0.1:38295/mcp", /* block */
    "list": [1, 2,],
  }`);
  assert.equal(parsed.url, "http://127.0.0.1:38295/mcp");
  assert.deepEqual(parsed.list, [1, 2]);
});

test("doctor passes a complete config against a healthy server", () => withDir(async (dir) => {
  const server = await healthServer();
  try {
    const result = await runDoctor({
      rest: ["--config", configFile(dir), "--url", `http://127.0.0.1:${server.address().port}`, "--json"],
      logger: { log() {} },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.checks.map((c) => c.ok), [true, true, true, true]);
  } finally {
    server.close();
  }
}));

test("doctor fails when the identity plugin is missing", () => withDir(async (dir) => {
  const server = await healthServer();
  try {
    const result = await runDoctor({
      rest: ["--config", configFile(dir, { plugin: false }), "--url", `http://127.0.0.1:${server.address().port}`],
      logger: { log() {} },
    });
    assert.equal(result.ok, false);
    const plugin = result.checks.find((c) => c.name === "identity plugin");
    assert.equal(plugin.ok, false);
    assert.match(plugin.detail, /brayer-opencode/);
  } finally {
    server.close();
  }
}));

test("doctor fails when brayer MCP is missing", () => withDir(async (dir) => {
  const server = await healthServer();
  try {
    const result = await runDoctor({
      rest: ["--config", configFile(dir, { mcp: false }), "--url", `http://127.0.0.1:${server.address().port}`],
      logger: { log() {} },
    });
    assert.equal(result.checks.find((c) => c.name === "brayer MCP").ok, false);
  } finally {
    server.close();
  }
}));
