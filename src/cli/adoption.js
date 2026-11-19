import { createStore } from "../store.js";
import { formatAdoption } from "./format.js";
import { flagValue } from "./args.js";

export async function runAdoption({ rest = [], env = process.env, logger = console } = {}) {
  const daysRaw = flagValue(rest, "--days");
  const days = daysRaw == null ? 30 : Number(daysRaw);
  if (!Number.isInteger(days) || days < 1) throw new Error("brayer: --days must be a positive integer");
  const harness = flagValue(rest, "--harness") ?? "opencode";
  const store = createStore({ dbPath: env.BRAYER_DB || undefined });
  try {
    const report = store.adoption.report({ days, harness });
    if (rest.includes("--json")) console.log(JSON.stringify(report, null, 2));
    else logger.log(formatAdoption(report));
    return report;
  } finally {
    store.close();
  }
}
