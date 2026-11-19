function formatMetric(card) {
  if (card.value == null) return "n/a";
  if (card.unit === "ratio") return `${(card.value * 100).toFixed(1)}%`;
  if (card.unit === "ms") return `${(card.value / 1000).toFixed(1)}s`;
  if (card.unit === "orders") return card.value.toFixed(1);
  return String(card.value);
}

function formatTarget(card) {
  if (card.unit === "ratio") return `${(card.target * 100).toFixed(0)}%`;
  if (card.unit === "ms") return `${(card.target / 1000).toFixed(0)}s`;
  if (card.unit === "orders") return String(card.target);
  return String(card.target);
}

export function formatAdoption(report) {
  const header = `${report.harness} adoption — last ${report.windowDays} days`;
  const rows = report.scorecard.map((card) => [
    card.ok ? "PASS" : "FAIL",
    card.label,
    formatMetric(card),
    card.lowerIsBetter ? `≤ ${formatTarget(card)}` : `≥ ${formatTarget(card)}`,
  ]);
  const widths = [4, Math.max(...rows.map((r) => r[1].length)), 6, 7];
  const lines = [
    `${header}: ${report.claims.total} claims, ${report.attempts.total} attempts, ${report.leaseExpiries} lease expiries`,
    "",
    ...rows.map((r) => `${r[0].padEnd(widths[0])}  ${r[1].padEnd(widths[1])}  ${r[2].padStart(widths[2])}  ${r[3].padStart(widths[3])}`),
  ];
  return lines.join("\n");
}

export function formatStatus(orders) {
  if (!orders.length) return "No work orders.";
  const rows = orders.map((o) => [
    o.id,
    o.status.padEnd(9),
    o.assignee ?? "-",
    String(o.attemptCount),
    o.title,
  ]);
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  return rows.map((r) => r.map((v, i) => (i === 4 ? v : v.padEnd(widths[i]))).join("  ")).join("\n");
}
