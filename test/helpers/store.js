import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStore } from "../../src/store.js";

export function withStore(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-test-"));
  const dbPath = path.join(dir, "store.sqlite");
  const store = createStore({
    dbPath,
    config: { blobsPath: path.join(dir, "blobs") },
  });
  try {
    return fn(store, dir, dbPath);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

export function withTempDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "brayer-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
