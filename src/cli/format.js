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
