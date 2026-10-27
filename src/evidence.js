import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function digest(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function blobPath(root, sha256) {
  return path.join(root, sha256.slice(0, 2), sha256);
}

export function storeFile({ root, filePath }) {
  if (!root) throw new Error("blob root is required");
  if (!filePath) throw new Error("filePath is required");
  const buffer = readFileSync(filePath);
  const sha256 = digest(buffer);
  const dest = blobPath(root, sha256);
  mkdirSync(path.dirname(dest), { recursive: true });
  if (!existsSync(dest)) writeFileSync(dest, buffer);
  return { sha256, uri: `file://${dest}` };
}

export function storeBytes({ root, buffer }) {
  if (!root) throw new Error("blob root is required");
  const sha256 = digest(buffer);
  const dest = blobPath(root, sha256);
  mkdirSync(path.dirname(dest), { recursive: true });
  if (!existsSync(dest)) writeFileSync(dest, buffer);
  return { sha256, uri: `file://${dest}` };
}

export function verifyFile({ root, sha256 }) {
  if (!sha256) return false;
  const file = blobPath(root, sha256);
  if (!existsSync(file)) return false;
  return digest(readFileSync(file)) === sha256;
}

export function readBlob({ root, sha256 }) {
  return readFileSync(blobPath(root, sha256));
}
