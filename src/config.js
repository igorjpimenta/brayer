import os from "node:os";
import path from "node:path";

const DEFAULTS = {
  dbPath: path.join(os.homedir(), ".brayer", "store.sqlite"),
  blobsPath: path.join(os.homedir(), ".brayer", "blobs"),
  leaseSeconds: 1800,
  maxAttempts: 3,
  httpPort: 38293,
  wsPort: 38294,
};

const ENV_KEYS = {
  dbPath: "BRAYER_DB",
  blobsPath: "BRAYER_BLOBS",
  leaseSeconds: "BRAYER_LEASE_SECONDS",
  maxAttempts: "BRAYER_MAX_ATTEMPTS",
  httpPort: "BRAYER_HTTP_PORT",
  wsPort: "BRAYER_WS_PORT",
};

const INT_KEYS = new Set(["leaseSeconds", "maxAttempts", "httpPort", "wsPort"]);

function parseInteger(key, value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`brayer: ${key} must be a non-negative integer`);
  return n;
}

export function resolveConfig({ explicit = {}, env = process.env } = {}) {
  for (const key of Object.keys(explicit)) {
    if (!(key in DEFAULTS)) throw new Error(`brayer: unknown config key: ${key}`);
  }

  const out = { ...DEFAULTS };
  for (const [key, envKey] of Object.entries(ENV_KEYS)) {
    if (env[envKey] !== undefined && env[envKey] !== "") out[key] = env[envKey];
  }
  Object.assign(out, explicit);

  for (const key of INT_KEYS) out[key] = parseInteger(key, out[key]);
  return out;
}

export { DEFAULTS };
