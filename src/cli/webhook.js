import { createStore } from "../store.js";
import { flagMap } from "./args.js";
import { webhookConfig } from "../claim-webhook.js";

export async function runWebhook({ rest, env }) {
  const [sub, ...webhookArgs] = rest;
  const values = flagMap(webhookArgs);
  const harness = values.harness;
  const store = createStore({ dbPath: env.BRAYER_DB || undefined });
  try {
    if (sub === "list") {
      const rows = store.webhook.list().map((row) => ({ ...row, bearer: row.bearer ? "<set>" : null }));
      console.log(JSON.stringify(rows, null, 2));
      return;
    }
    if (!["set", "remove", "test"].includes(sub)) {
      throw new Error("brayer: webhook requires set, list, remove or test");
    }
    if (!harness) throw new Error(`brayer: webhook ${sub} requires --harness`);
    if (sub === "remove") {
      if (!store.webhook.remove({ harness })) throw new Error(`brayer: no webhook for ${harness}`);
      console.log(JSON.stringify({ removed: harness }));
      return;
    }
    if (sub === "set") {
      if (!values.url) throw new Error("brayer: webhook set requires --url");
      const timeoutMs = values["timeout-ms"] !== undefined ? Number(values["timeout-ms"]) : null;
      const row = store.webhook.upsert({
        harness,
        url: values.url,
        bearer: values.bearer ?? null,
        timeoutMs,
      });
      console.log(JSON.stringify({ ...row, bearer: row.bearer ? "<set>" : null }, null, 2));
      return;
    }
    const hook = webhookConfig(store.config, harness, store.webhook.get(harness));
    if (!hook) throw new Error(`brayer: no webhook for ${harness}`);
    const headers = { "content-type": "application/json" };
    if (hook.bearer) headers.authorization = `Bearer ${hook.bearer}`;
    const res = await fetch(hook.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ event: "webhook.test", at: Date.now(), harness }),
      signal: AbortSignal.timeout(hook.timeoutMs),
    });
    const text = await res.text();
    console.log(JSON.stringify({ ok: res.ok, status: res.status, body: text.slice(0, 500) }, null, 2));
    if (!res.ok) process.exitCode = 1;
  } finally {
    store.close();
  }
}
