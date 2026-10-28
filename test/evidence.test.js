import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { withStore } from "./helpers/store.js";
import { storeFile, verifyFile } from "../src/evidence.js";

test("stores a file by content hash and verifies it", () => withStore((store, dir) => {
  const file = path.join(dir, "diff.patch");
  writeFileSync(file, "diff --git a/x b/x\n");
  const stored = storeFile({ root: store.config.blobsPath, filePath: file });
  assert.match(stored.sha256, /^[a-f0-9]{64}$/);
  assert.equal(verifyFile({ root: store.config.blobsPath, sha256: stored.sha256 }), true);
  assert.equal(verifyFile({ root: store.config.blobsPath, sha256: "0".repeat(64) }), false);
}));
