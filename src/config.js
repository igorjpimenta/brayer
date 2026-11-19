import os from "node:os";
import path from "node:path";

const DEFAULTS = {
  dbPath: path.join(os.homedir(), ".brayer", "store.sqlite"),
  blobsPath: path.join(os.homedir(), ".brayer", "blobs"),
  leaseSeconds: 1800,
  maxAttempts: 3,
  httpPort: 38293,
  wsPort: 38294,
  claimWebhookUrl: "",
  claimWebhookBearer: "",
  claimWebhookTimeoutMs: 3000,
  claimWebhooks: {},
  requireCheckpoint: false,
  requireUsage: false,
};

const ENV_KEYS = {
  dbPath: "BRAYER_DB",
  blobsPath: "BRAYER_BLOBS",
  leaseSeconds: "BRAYER_LEASE_SECONDS",
  maxAttempts: "BRAYER_MAX_ATTEMPTS",
  httpPort: "BRAYER_HTTP_PORT",
  wsPort: "BRAYER_WS_PORT",
  claimWebhookUrl: "BRAYER_CLAIM_WEBHOOK_URL",
  claimWebhookBearer: "BRAYER_CLAIM_WEBHOOK_BEARER",
  claimWebhookTimeoutMs: "BRAYER_CLAIM_WEBHOOK_TIMEOUT_MS",
  requireCheckpoint: "BRAYER_REQUIRE_CHECKPOINT",
  requireUsage: "BRAYER_REQUIRE_USAGE",
};

const INT_KEYS = new Set(["leaseSeconds", "maxAttempts", "httpPort", "wsPort", "claimWebhookTimeoutMs"]);
const BOOL_KEYS = new Set(["requireCheckpoint", "requireUsage"]);

function parseInteger(key, value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`brayer: ${key} must be a non-negative integer`);
  return n;
}

function parseBoolean(key, value) {
  if (typeof value === "boolean") return value;
  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off", ""].includes(raw)) return false;
  throw new Error(`brayer: ${key} must be a boolean`);
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

  if (env.BRAYER_CLAIM_WEBHOOKS !== undefined && env.BRAYER_CLAIM_WEBHOOKS !== "") {
    try {
      out.claimWebhooks = JSON.parse(env.BRAYER_CLAIM_WEBHOOKS);
    } catch {
      throw new Error("brayer: BRAYER_CLAIM_WEBHOOKS must be valid JSON");
    }
  }
  if (!out.claimWebhooks || typeof out.claimWebhooks !== "object" || Array.isArray(out.claimWebhooks)) {
    throw new Error("brayer: claimWebhooks must be an object");
  }

  for (const key of INT_KEYS) out[key] = parseInteger(key, out[key]);
  for (const key of BOOL_KEYS) out[key] = parseBoolean(key, out[key]);
  return out;
}

export { DEFAULTS };
