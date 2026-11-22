import test from "node:test";
import assert from "node:assert/strict";
import { createCapture } from "../../../../../plugins/opencode/brayer/capture.js";

function fakeSpawn(response) {
  const calls = [];
  const spawn = (bin, args, opts, cb) => {
    calls.push({ bin, args });
    setImmediate(() => cb(null, response ?? "{}"));
  };
  return { spawn, calls };
}

test("writes one checkpoint per idle when the attempt is running", async () => {
  const { spawn, calls } = fakeSpawn(JSON.stringify({ written: true, checkpointId: "CKP-1" }));
  const capture = createCapture({ spawn, minIntervalMs: 0 });
  assert.equal(await capture({ sessionID: "ses_1" }), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args[0], "checkpoint");
  assert.deepEqual(calls[0].args.slice(1, 3), ["write", "--session"]);
});

test("is a no-op without a running attempt", async () => {
  const { spawn } = fakeSpawn(JSON.stringify({ written: false, reason: "no_running_attempt" }));
  const capture = createCapture({ spawn, minIntervalMs: 0 });
  assert.equal(await capture({ sessionID: "ses_1" }), false);
});

test("throttles repeated idles per session", async () => {
  const { spawn, calls } = fakeSpawn(JSON.stringify({ written: true }));
  const capture = createCapture({ spawn, minIntervalMs: 60000 });
  assert.equal(await capture({ sessionID: "ses_1" }), true);
  assert.equal(await capture({ sessionID: "ses_1" }), false);
  assert.equal(await capture({ sessionID: "ses_2" }), true);
  assert.equal(calls.length, 2);
});

test("can be disabled by env and ignores missing sessions", async () => {
  const { spawn, calls } = fakeSpawn(JSON.stringify({ written: true }));
  const capture = createCapture({ spawn, minIntervalMs: 0, env: { BRAYER_CAPTURE_DISABLE: "1" } });
  assert.equal(await capture({ sessionID: "ses_1" }), false);
  const plain = createCapture({ spawn, minIntervalMs: 0 });
  assert.equal(await plain({}), false);
  assert.equal(await plain({ sessionID: "ses_1" }), true);
  assert.equal(calls.length, 1);
});
