import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createStore } from "../src/store.js";
import { startEventServer, lastEventId, eventsSince, toEventMessage } from "../src/events-ws.js";

function withStore(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-events-"));
  const store = createStore({ dbPath: path.join(dir, "store.sqlite") });
  try {
    return fn(store);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test("event helpers read the append-only log", () => withStore((store) => {
  const order = store.order.create({ title: "t", goal: "g", acceptance: "a" });
  const last = lastEventId(store);
  assert.equal(last, 1);
  const since = eventsSince(store, 0);
  assert.equal(since.length, 1);
  assert.equal(since[0].kind, "order.created");
  const message = toEventMessage(store, since[0]);
  assert.equal(message.type, "event");
  assert.equal(message.event.order.id, order.id);
}));

test("streams history and new events over websocket", { skip: typeof WebSocket === "undefined" }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-ws-"));
  const store = createStore({ dbPath: path.join(dir, "store.sqlite") });
  const server = startEventServer({ store, port: 0, host: "127.0.0.1", intervalMs: 20 });
  await once(server, "listening");
  const port = server.address().port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const queue = [];
  const waiters = [];
  ws.onmessage = (event) => {
    const msg = JSON.parse(String(event.data));
    if (waiters.length) waiters.shift()(msg);
    else queue.push(msg);
  };
  const next = () => (queue.length ? Promise.resolve(queue.shift()) : new Promise((resolve) => waiters.push(resolve)));
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

  const welcome = await next();
  assert.equal(welcome.type, "welcome");
  const history = await next();
  assert.equal(history.type, "history");
  assert.equal(history.events.length, 0);

  const order = store.order.create({ title: "streamed", goal: "g", acceptance: "a" });
  const event = await next();
  assert.equal(event.type, "event");
  assert.equal(event.event.order.id, order.id);
  assert.equal(event.event.kind, "order.created");

  ws.close();
  server.closeAllConnections?.();
  server.close();
  server.unref?.();
  store.close();
  rmSync(dir, { recursive: true, force: true });
});
