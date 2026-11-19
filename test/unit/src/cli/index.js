import test from "node:test";
import assert from "node:assert/strict";
import { formatStatus } from "../../../../src/cli/index.js";
import { formatAdoption } from "../../../../src/cli/format.js";

test("formats an empty queue", () => {
  assert.equal(formatStatus([]), "No work orders.");
});

test("formats order rows with stable columns", () => {
  const out = formatStatus([
    { id: "WO-a", status: "ready", assignee: null, attemptCount: 0, title: "first" },
    { id: "WO-b", status: "running", assignee: "claude:worker:s1", attemptCount: 2, title: "second" },
  ]);
  assert.match(out, /WO-a\s+ready\s+-\s+0\s+first/);
  assert.match(out, /WO-b\s+running\s+claude:worker:s1\s+2\s+second/);
});

test("formats the adoption scorecard with pass/fail and units", () => {
  const out = formatAdoption({
    harness: "opencode",
    windowDays: 30,
    claims: { total: 3 },
    attempts: { total: 0 },
    leaseExpiries: 3,
    scorecard: [
      { key: "realOrdersPerWeek", label: "Real orders claimed / week", value: 0, target: 20, ok: false, unit: "orders" },
      { key: "claimToAttempt5m", label: "Claim → attempt within 5 min", value: 0.5, target: 0.9, ok: false, unit: "ratio" },
      { key: "medianClaimToAttempt", label: "Median claim → attempt", value: 1500, target: 120000, ok: true, unit: "ms" },
      { key: "leaseExpiries", label: "OpenCode lease expiries", value: 3, target: 0, ok: false, unit: "count", lowerIsBetter: true },
    ],
  });
  assert.match(out, /opencode adoption — last 30 days/);
  assert.match(out, /FAIL\s+Real orders claimed \/ week\s+0\.0\s+≥ 20/);
  assert.match(out, /FAIL\s+Claim → attempt within 5 min\s+50\.0%\s+≥ 90%/);
  assert.match(out, /PASS\s+Median claim → attempt\s+1\.5s\s+≥ 120s/);
  assert.match(out, /FAIL\s+OpenCode lease expiries\s+3\s+≤ 0/);
});
