import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createStore } from "../src/store.js";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const bin = path.join(root, "bin/brayer.js");
const pluginDir = path.join(root, "plugins/opencode/brayer");
const dir = mkdtempSync(path.join(tmpdir(), "brayer-opencode-proof-"));
const dbPath = path.join(dir, "store.sqlite");
const port = 39151;
const bearer = "proof-secret";
const model = process.env.OPENCODE_MODEL ?? "opencode/deepseek-v4.1-flash-free";
const opencode = process.env.OPENCODE_BIN ?? "opencode";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? dir,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command} timed out`));
    }, options.timeout ?? 300000);
    child.on("error", reject);
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited ${code}\n${stderr.slice(-4000)}`));
    });
  });
}

async function waitHealth() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("brayer HTTP server did not become healthy");
}

mkdirSync(path.join(dir, ".opencode", "plugins"), { recursive: true });
mkdirSync(path.join(dir, ".opencode", "brayer-lib"), { recursive: true });
copyFileSync(path.join(pluginDir, "index.js"), path.join(dir, ".opencode", "plugins", "brayer.js"));
for (const file of ["hooks.js", "identity.js"]) {
  copyFileSync(path.join(pluginDir, file), path.join(dir, ".opencode", "brayer-lib", file));
}
const pluginEntry = path.join(dir, ".opencode", "plugins", "brayer.js");
writeFileSync(pluginEntry, readFileSync(pluginEntry, "utf8").replace('"./hooks.js"', '"../brayer-lib/hooks.js"'));
writeFileSync(path.join(dir, "evidence.txt"), "deep proof evidence\n");
writeFileSync(path.join(dir, "opencode.json"), JSON.stringify({
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    brayer: {
      type: "remote",
      url: `http://127.0.0.1:${port}/mcp`,
      headers: { Authorization: `Bearer ${bearer}` },
    },
  },
}, null, 2));

const store = createStore({ dbPath });
const order = store.order.create({
  title: "opencode proof",
  goal: "run the full lifecycle through opencode",
  acceptance: "approved with evidence and verdict",
  status: "ready",
});
store.close();

const server = spawn(process.execPath, [bin, "serve", "--mcp", "http", "--port", String(port)], {
  cwd: root,
  env: {
    ...process.env,
    BRAYER_HARNESS: "opencode",
    BRAYER_MCP_BEARER: bearer,
    BRAYER_DB: dbPath,
    BRAYER_BLOBS: path.join(dir, "blobs"),
  },
  stdio: "ignore",
});

try {
  await waitHealth();
  const prompt = [
    `Run this exact Brayer lifecycle for order ${order.id}. Use the brayer MCP tools; do not use shell/curl.`,
    `1) brayer_order_get orderId ${order.id}.`,
    `2) brayer_order_claim orderId ${order.id}.`,
    `3) brayer_attempt_start orderId ${order.id}.`,
    `4) brayer_checkpoint_write orderId ${order.id}, the returned attemptId, state {"next_step":"finish"}, treeHash "proof-tree".`,
    `5) brayer_evidence_attach orderId ${order.id}, attemptId, kind "log", path "${path.join(dir, "evidence.txt")}".`,
    `6) brayer_attempt_finish attemptId, status "finished".`,
    `7) brayer_verdict_issue orderId ${order.id}, decision "approve", reason "proof".`,
    `Report each result.`,
  ].join(" ");
  await run(opencode, ["run", "--auto", "--format", "json", "--dir", dir, "-m", model, prompt], {
    env: { BRAYER_AGENT: "build" },
  });

  const check = createStore({ dbPath });
  try {
    const final = check.order.get(order.id);
    const checkpoint = check.checkpoint.latest({ workOrderId: order.id });
    const evidence = check.evidence.list({ workOrderId: order.id });
    const verdicts = check.verdict.list({ workOrderId: order.id });
    const attempts = check.attempt.list({ workOrderId: order.id });
    const events = check.event.list({ workOrderId: order.id }).map((event) => event.kind);
    if (final.status !== "approved") throw new Error(`order is ${final.status}, expected approved`);
    if (checkpoint?.treeHash !== "proof-tree") throw new Error("checkpoint missing or wrong treeHash");
    if (evidence.length !== 1) throw new Error(`expected 1 evidence row, got ${evidence.length}`);
    if (verdicts.length !== 1 || verdicts[0].decision !== "approve") throw new Error("approve verdict missing");
    if (attempts.length !== 1 || attempts[0].checkpointId !== checkpoint.id) throw new Error("attempt checkpoint link missing");
    if (verdicts[0].attemptId !== attempts[0].id) throw new Error("verdict attempt link missing");
    const expected = ["order.created", "order.claimed", "attempt.started", "checkpoint.written", "evidence.attached", "attempt.finished", "verdict.issued"];
    if (JSON.stringify(events) !== JSON.stringify(expected)) throw new Error(`event order mismatch: ${JSON.stringify(events)}`);
    console.log(JSON.stringify({ ok: true, orderId: order.id, status: final.status, checkpoint: checkpoint.id, evidence: evidence[0].id, verdict: verdicts[0].id, events }, null, 2));
  } finally {
    check.close();
  }
} finally {
  server.kill("SIGTERM");
  rmSync(dir, { recursive: true, force: true });
}
