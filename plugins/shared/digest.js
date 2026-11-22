// digest.js — the ready-work digest format shared by every harness adapter.
// Memory MCPs converge on the same shape: bounded budget, silent failure, one
// injection per session. Adapters fetch the orders their own way (CLI spawn,
// direct store) and format through this module so the text stays identical.

export const ACCEPTANCE_CHARS = 160;
export const TITLE_CHARS = 80;
export const MAX_CHARS = 4000;

function truncate(text, max) {
  const t = String(text ?? "").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

export function formatReadyDigest(orders, { limit = 5 } = {}) {
  const all = Array.isArray(orders) ? orders : [];
  const shown = all.slice(0, limit);
  if (!shown.length) return null;
  const header = [
    `Brayer: ${all.length} ready work order${all.length === 1 ? "" : "s"}`,
    shown.length < all.length ? ` (top ${shown.length} by priority)` : "",
    ". If one fits this session's task, claim it with brayer_order_claim — an attempt opens in the same call — and report through the Brayer tools. Otherwise ignore this note.",
  ].join("");
  const lines = shown.map((order) =>
    `- ${order.id} (p${order.priority ?? 50}) ${truncate(order.title ?? "(untitled)", TITLE_CHARS)} — ${truncate(order.acceptance, ACCEPTANCE_CHARS)}`);
  let text = [header, ...lines].join("\n");
  while (text.length > MAX_CHARS && lines.length > 1) {
    lines.pop();
    text = [header, ...lines, `… ${all.length - lines.length} more: run brayer order ready`].join("\n");
  }
  return text;
}
