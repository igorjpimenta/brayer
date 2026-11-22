import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStore } from "../../src/store.js";

export async function withStore(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-test-"));
  const dbPath = path.join(dir, "store.sqlite");
  const store = createStore({
    dbPath,
    config: {
      blobsPath: path.join(dir, "blobs"),
      // global fallback keeps every harness claimable; tests that exercise the
      // claim gate build their own store without it
      claimWebhookUrl: "http://127.0.0.1:9/claimed",
    },
  });
  try {
    // awaited so async test bodies finish before the temp dir is removed
    return await fn(store, dir, dbPath);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function withTempDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-test-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
