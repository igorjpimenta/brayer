import { createStore } from "../store.js";
import { formatStatus } from "./format.js";

export async function runStatus({ rest, env }) {
  const store = createStore({ dbPath: env.BRAYER_DB || undefined });
  try {
    const orders = store.order.list({ limit: 100 });
    if (rest.includes("--json")) console.log(JSON.stringify({ orders }, null, 2));
    else console.log(formatStatus(orders));
  } finally {
    store.close();
  }
}
