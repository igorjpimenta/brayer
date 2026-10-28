import { now } from "./util.js";

export function createWebhookApi({ db }) {
  const webhookApi = {
    upsert({ harness, url, bearer = null, timeoutMs = null }) {
      const h = typeof harness === "string" ? harness.trim() : "";
      if (!h) throw new Error("webhook target requires a harness");
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        throw new Error(`invalid webhook url: ${JSON.stringify(url)}`);
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`webhook url must be http(s): ${JSON.stringify(url)}`);
      }
      if (timeoutMs != null && (!Number.isInteger(timeoutMs) || timeoutMs <= 0)) {
        throw new Error(`webhook timeoutMs must be a positive integer, got ${JSON.stringify(timeoutMs)}`);
      }
      const t = now();
      db.prepare(`
        INSERT INTO webhook_targets(harness, url, bearer, timeout_ms, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(harness) DO UPDATE SET url=excluded.url, bearer=excluded.bearer,
          timeout_ms=excluded.timeout_ms, updated_at=excluded.updated_at
      `).run(h, parsed.toString(), bearer ?? null, timeoutMs ?? null, t, t);
      return webhookApi.get(h);
    },

    get(harness) {
      const row = db.prepare("SELECT * FROM webhook_targets WHERE harness=?").get(harness);
      if (!row) return null;
      return {
        harness: row.harness,
        url: row.url,
        bearer: row.bearer,
        timeoutMs: row.timeout_ms,
      };
    },

    list() {
      return db.prepare("SELECT * FROM webhook_targets ORDER BY harness ASC").all().map((row) => ({
        harness: row.harness,
        url: row.url,
        bearer: row.bearer,
        timeoutMs: row.timeout_ms,
      }));
    },

    remove({ harness }) {
      return db.prepare("DELETE FROM webhook_targets WHERE harness=?").run(harness).changes > 0;
    },
  };

  return webhookApi;
}
