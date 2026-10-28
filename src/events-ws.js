import http from "node:http";
import crypto from "node:crypto";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
export const DEFAULT_WS_PORT = 38294;
export const HISTORY_LIMIT = 200;

function acceptKey(key) {
  return crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
}

function encodeFrame(text) {
  const payload = Buffer.from(text, "utf8");
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function rowEvent(r) {
  return {
    id: r.id,
    kind: r.kind,
    workOrderId: r.work_order_id,
    attemptId: r.attempt_id,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    actor: r.actor,
    note: r.note,
    sessionRef: r.session_ref,
    at: r.at,
  };
}

export function lastEventId(store) {
  return store.db.prepare("SELECT COALESCE(MAX(id),0) AS m FROM events").get().m;
}

export function eventsSince(store, id, limit = HISTORY_LIMIT) {
  return store.db.prepare("SELECT * FROM events WHERE id > ? ORDER BY id LIMIT ?").all(id, limit).map(rowEvent);
}

export function eventsLatest(store, limit = HISTORY_LIMIT) {
  return store.db.prepare("SELECT * FROM events ORDER BY id DESC LIMIT ?").all(limit).reverse().map(rowEvent);
}

export function toEventMessage(store, event) {
  const order = store.order.get(event.workOrderId);
  return {
    type: "event",
    event: {
      ...event,
      order: order ? { id: order.id, title: order.title, status: order.status, assignee: order.assignee } : null,
    },
  };
}

export function startEventServer({ store, port = null, host = "127.0.0.1", intervalMs = 1000, historyLimit = HISTORY_LIMIT, logger } = {}) {
  const listenPort = port ?? store.config.wsPort ?? DEFAULT_WS_PORT;
  const pollMs = intervalMs;
  const history = historyLimit;
  const clients = new Set();
  let cursor = lastEventId(store);

  function broadcast(obj) {
    const frame = encodeFrame(JSON.stringify(obj));
    for (const sock of [...clients]) {
      if (sock.destroyed || !sock.writable) {
        clients.delete(sock);
        continue;
      }
      sock.write(frame);
    }
  }

  const server = http.createServer((req, res) => {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("brayer events: websocket only\n");
  });

  server.on("upgrade", (req, socket) => {
    const key = req.headers["sec-websocket-key"];
    if ((req.headers.upgrade || "").toLowerCase() !== "websocket" || !key) {
      socket.destroy();
      return;
    }
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`
    );
    clients.add(socket);
    socket.on("close", () => clients.delete(socket));
    socket.on("error", () => clients.delete(socket));
    socket.on("data", (frame) => {
      if ((frame[0] & 0x0f) === 0x8) {
        clients.delete(socket);
        socket.end();
      }
    });
    socket.write(encodeFrame(JSON.stringify({ type: "welcome", lastEventId: cursor })));
    socket.write(encodeFrame(JSON.stringify({ type: "history", events: eventsLatest(store, history) })));
    logger?.info?.(`brayer: ws subscriber connected (${clients.size} total)`);
  });

  const timer = setInterval(() => {
    if (!store.db.open) return;
    const rows = eventsSince(store, cursor, history);
    if (!rows.length) return;
    for (const event of rows) {
      cursor = Math.max(cursor, event.id);
      broadcast(toEventMessage(store, event));
    }
  }, pollMs);
  timer.unref?.();

  server.on("close", () => clearInterval(timer));
  server.listen(listenPort, host, () => {
    logger?.info?.(`brayer: ws listening on ${host}:${server.address().port}`);
  });
  return server;
}
