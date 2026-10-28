import test from "node:test";
import assert from "node:assert/strict";
import { withStore } from "../../../helpers/store.js";

test("upserts, reads, lists and removes webhook targets", () => withStore((store) => {
  const row = store.webhook.upsert({ harness: "opencode", url: "http://127.0.0.1:9/hook", bearer: "s3cret" });
  assert.equal(row.harness, "opencode");
  assert.equal(row.bearer, "s3cret");
  assert.deepEqual(store.webhook.get("opencode"), row);
  assert.equal(store.webhook.list().length, 1);

  const updated = store.webhook.upsert({ harness: "opencode", url: "https://example.com/hook" });
  assert.equal(updated.url, "https://example.com/hook");
  assert.equal(updated.bearer, null);
  assert.equal(store.webhook.remove({ harness: "opencode" }), true);
  assert.equal(store.webhook.get("opencode"), null);
}));

test("refuses invalid webhook targets", () => withStore((store) => {
  assert.throws(() => store.webhook.upsert({ harness: "", url: "http://x" }), /requires a harness/);
  assert.throws(() => store.webhook.upsert({ harness: "h", url: "not a url" }), /invalid webhook url/);
  assert.throws(() => store.webhook.upsert({ harness: "h", url: "ftp://x" }), /must be http/);
  assert.throws(() => store.webhook.upsert({ harness: "h", url: "http://x", timeoutMs: 0 }), /positive integer/);
}));
