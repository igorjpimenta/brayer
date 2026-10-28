import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "../../src/store.js";
import { resumeSession } from "../../plugins/shared/contract.js";

const fixture = fileURLToPath(new URL("./fixture-kill.js", import.meta.url));

function killAdapter({ dbPath, orderId, harness }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fixture], {
      env: {
        ...process.env,
        BRAYER_DB: dbPath,
        BRAYER_TEST_ORDER: orderId,
        BRAYER_TEST_HARNESS: harness,
      },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`fixture exited ${code}`))));
  });
}

test("resumes an order after the adapter process is killed", async () => {
  for (const harness of ["opencode", "openclaw"]) {
    const dir = mkdtempSync(path.join(tmpdir(), `brayer-e2e-${harness}-`));
    const dbPath = path.join(dir, "store.sqlite");
    const first = createStore({ dbPath });
    const order = first.order.create({
      title: "kill resume",
      goal: "resume from checkpoint",
      acceptance: "checkpoint survives",
      status: "ready",
    });
    first.close();

    await killAdapter({ dbPath, orderId: order.id, harness });

    const second = createStore({ dbPath });
    try {
      const resumed = resumeSession({
        store: second,
        session: { harness, agent: "worker", session: "s1" },
        orderId: order.id,
      });
      assert.equal(resumed.order.status, "running");
      assert.equal(resumed.attempt.status, "running");
      assert.equal(resumed.checkpoint.treeHash, "e2e-tree");
      assert.deepEqual(resumed.checkpoint.state, { next_step: "continue" });
    } finally {
      second.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
