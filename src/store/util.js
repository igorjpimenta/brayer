export function now() { return Date.now(); }
export function jsonOut(v) { return v == null ? null : JSON.stringify(v); }
export function jsonIn(v) { if (v == null) return null; try { return JSON.parse(v); } catch { return null; } }
