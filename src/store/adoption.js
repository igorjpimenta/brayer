const DAY_MS = 24 * 60 * 60 * 1000;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function ratio(n, d) {
  return d > 0 ? n / d : null;
}

export function createAdoptionApi({ db }) {
  return {
    report({ days = 30, now: at = Date.now(), harness = "opencode" } = {}) {
      const since = at - days * DAY_MS;
      const like = `${harness}:%`;

      // A "real" order carries a workspace. Proof and gate orders are created
      // without one, so this keeps the scorecard from counting scaffolding as
      // pipeline demand.
      const claims = db.prepare(`
        SELECT e.work_order_id AS workOrderId, e.at AS claimAt, e.actor AS actor,
               w.workspace AS workspace,
               (SELECT MIN(a.at) FROM events a
                 WHERE a.work_order_id=e.work_order_id AND a.kind='attempt.started' AND a.at>=e.at) AS attemptAt
          FROM events e
          JOIN work_orders w ON w.id=e.work_order_id
         WHERE e.kind='order.claimed' AND e.actor LIKE ? AND e.at>=?
         ORDER BY e.at ASC
      `).all(like, since);

      const deltas = [];
      let real = 0;
      let fast = 0;
      let matched = 0;
      for (const claim of claims) {
        if (claim.workspace) real += 1;
        if (claim.attemptAt == null) continue;
        matched += 1;
        const delta = claim.attemptAt - claim.claimAt;
        deltas.push(delta);
        if (delta <= 5 * 60 * 1000) fast += 1;
      }

      const attempts = db.prepare(`
        SELECT a.*,
               (SELECT COUNT(*) FROM verdicts v WHERE v.attempt_id=a.id) AS verdicts,
               (SELECT COUNT(*) FROM checkpoints c WHERE c.attempt_id=a.id) AS checkpoints
          FROM attempts a
         WHERE a.harness=? AND a.started_at>=?
      `).all(harness, since);

      let finished = 0;
      let withVerdict = 0;
      let withCheckpoint = 0;
      let usageReported = 0;
      for (const attempt of attempts) {
        if (attempt.status === "finished") finished += 1;
        if (attempt.verdicts > 0) withVerdict += 1;
        if (attempt.checkpoints > 0) withCheckpoint += 1;
        if ((attempt.tokens_in ?? 0) + (attempt.tokens_out ?? 0) + (attempt.cache_read ?? 0) + (attempt.tool_calls ?? 0) > 0) {
          usageReported += 1;
        }
      }

      const leaseExpiries = db.prepare(`
        SELECT COUNT(*) AS n
          FROM events r
         WHERE r.kind='order.released' AND r.note='lease expired' AND r.at>=?
           AND (SELECT c.actor FROM events c
                 WHERE c.work_order_id=r.work_order_id AND c.kind='order.claimed' AND c.at<=r.at
                 ORDER BY c.at DESC LIMIT 1) LIKE ?
      `).get(since, like).n;

      const realPerWeek = days > 0 ? (real / days) * 7 : 0;
      const medianDelta = median(deltas);
      const claimToAttempt5m = ratio(fast, matched);
      const verdictShare = ratio(withVerdict, attempts.length);
      const usageShare = ratio(usageReported, attempts.length);
      const checkpointShare = ratio(withCheckpoint, attempts.length);

      const scorecard = [
        { key: "realOrdersPerWeek", label: "Real orders claimed / week", value: realPerWeek, target: 20, ok: realPerWeek >= 20, unit: "orders" },
        { key: "claimToAttempt5m", label: "Claim → attempt within 5 min", value: claimToAttempt5m, target: 0.9, ok: claimToAttempt5m != null && claimToAttempt5m >= 0.9, unit: "ratio" },
        { key: "verdictShare", label: "Attempts with a verdict", value: verdictShare, target: 0.8, ok: verdictShare != null && verdictShare >= 0.8, unit: "ratio" },
        { key: "leaseExpiries", label: "OpenCode lease expiries", value: leaseExpiries, target: 0, ok: leaseExpiries === 0, unit: "count", lowerIsBetter: true },
        { key: "usageShare", label: "Attempts reporting usage", value: usageShare, target: 1, ok: usageShare != null && usageShare >= 1, unit: "ratio" },
        { key: "medianClaimToAttempt", label: "Median claim → attempt", value: medianDelta, target: 2 * 60 * 1000, ok: medianDelta != null && medianDelta < 2 * 60 * 1000, unit: "ms" },
      ];

      return {
        harness,
        windowDays: days,
        since,
        generatedAt: at,
        claims: {
          total: claims.length,
          real,
          matched,
          within5m: fast,
          medianToAttemptMs: medianDelta,
        },
        attempts: {
          total: attempts.length,
          finished,
          withVerdict,
          withCheckpoint,
          usageReported,
        },
        leaseExpiries,
        rates: { claimToAttempt5m, verdictShare, usageShare, checkpointShare },
        scorecard,
      };
    },
  };
}
