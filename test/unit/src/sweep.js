import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runSweep } from "../../../src/sweep.js";
import { createStore } from "../../../src/store.js";
import { readyOrder } from "../../helpers/fixtures.js";

test("sweeps expired leases", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-sweep-"));
  const dbPath = path.join(dir, "store.sqlite");
  const store = createStore({ dbPath, config: { leaseSeconds: 1 } });
  try {
    const order = readyOrder(store);
    store.claim.claimById({ id: order.id, agentId: "claude:worker:s1", leaseSeconds: 0 });
    const result = store.claim.sweepExpired({ at: Date.now() + 1000 });
    assert.deepEqual(result, { released: 1, blocked: 0 });
    assert.equal(store.order.get(order.id).status, "ready");
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("blocks an order at the attempt cap", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-sweep-"));
  const dbPath = path.join(dir, "store.sqlite");
  const store = createStore({ dbPath, config: { maxAttempts: 1 } });
  try {
    const order = readyOrder(store);
    store.claim.claimById({ id: order.id, agentId: "claude:worker:s1", leaseSeconds: 0 });
    const result = store.claim.sweepExpired({ at: Date.now() + 1000, maxAttempts: 1 });
    assert.deepEqual(result, { released: 0, blocked: 1 });
    assert.equal(store.order.get(order.id).status, "blocked");
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("does not sweep live leases", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-sweep-"));
  const dbPath = path.join(dir, "store.sqlite");
  const store = createStore({ dbPath });
  try {
    const order = readyOrder(store);
    store.claim.claimById({ id: order.id, agentId: "claude:worker:s1", leaseSeconds: 3600 });
    const result = store.claim.sweepExpired();
    assert.deepEqual(result, { released: 0, blocked: 0 });
    assert.equal(store.order.get(order.id).status, "claimed");
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
