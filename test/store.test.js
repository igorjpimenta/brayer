import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStore } from "../src/store.js";

function withStore(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-store-"));
  const dbPath = path.join(dir, "store.sqlite");
  const store = createStore({ dbPath });
  try {
    return fn(store, dbPath);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test("creates and reads an order", () => withStore((store) => {
  const order = store.order.create({
    title: "Fix intake 500",
    goal: "The intake endpoint returns 200 for a valid job description",
    acceptance: "POST /api/intake returns 200 and the row is persisted",
    workspace: "/tmp/repo",
    repo: "igorpimenta/portal",
    branch: "fix/intake",
    approvalMode: "evidence",
  });

  assert.match(order.id, /^WO-/);
  assert.equal(order.status, "draft");
  assert.equal(order.acceptance, "POST /api/intake returns 200 and the row is persisted");
  assert.equal(store.order.get(order.id).title, "Fix intake 500");
  assert.equal(store.order.list().length, 1);
}));

test("writes order.created in the same transaction", () => withStore((store) => {
  const order = store.order.create({
    title: "Resume session",
    goal: "A killed session can resume",
    acceptance: "The resumed attempt reads the checkpoint",
  });

  const events = store.event.list({ workOrderId: order.id });
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "order.created");
  assert.equal(events[0].toStatus, "draft");
  assert.equal(events[0].workOrderId, order.id);
}));

test("refuses an order without acceptance", () => withStore((store) => {
  assert.throws(() => store.order.create({ title: "x", goal: "y", acceptance: "  " }), /acceptance is required/);
}));

test("refuses an unknown status", () => withStore((store) => {
  assert.throws(() => store.order.create({
    title: "x", goal: "y", acceptance: "z", status: "shipped",
  }), /invalid order status/);
}));

test("persists orders across a reopen", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-store-"));
  const dbPath = path.join(dir, "store.sqlite");
  const first = createStore({ dbPath });
  const order = first.order.create({ title: "a", goal: "b", acceptance: "c" });
  first.close();

  const second = createStore({ dbPath });
  try {
    assert.equal(second.order.get(order.id).title, "a");
    assert.equal(second.event.list({ workOrderId: order.id }).length, 1);
  } finally {
    second.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
