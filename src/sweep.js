import { createStore } from "./store.js";

export function parseSweepArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith("--") && args[i + 1] !== undefined) {
      out[args[i].slice(2)] = args[i + 1];
      i += 1;
    }
  }
  return out;
}

export async function runSweep({ args = [], env = process.env, logger = console } = {}) {
  const values = parseSweepArgs(args);
  const maxAttempts = values["max-attempts"] !== undefined ? Number(values["max-attempts"]) : undefined;
  if (maxAttempts !== undefined && (!Number.isInteger(maxAttempts) || maxAttempts < 1)) {
    throw new Error("brayer: --max-attempts must be a positive integer");
  }
  const store = createStore({ dbPath: env.BRAYER_DB || undefined });
  try {
    const result = store.claim.sweepExpired(maxAttempts === undefined ? {} : { maxAttempts });
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    store.close();
  }
}
