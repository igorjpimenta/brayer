// doctor.js — OpenCode-side configuration check. This is harness knowledge
// (which config file, which plugin must be loaded), so it lives in the
// adapter, not in the harness-agnostic core; `brayer doctor` in the core CLI
// was removed with it.

import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export function flagValue(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

export function parseJsonc(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; out += ch; continue; }
    if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      out += "\n";
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 1;
      continue;
    }
    out += ch;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

function resolveConfigPath(explicit, env) {
  if (explicit) return explicit;
  if (env.OPENCODE_CONFIG) return env.OPENCODE_CONFIG;
  const base = path.join(os.homedir(), ".config", "opencode");
  for (const name of ["opencode.json", "opencode.jsonc"]) {
    const candidate = path.join(base, name);
    if (existsSync(candidate)) return candidate;
  }
  return path.join(base, "opencode.jsonc");
}

function pluginConfigured(plugins) {
  return Array.isArray(plugins) && plugins.some((entry) =>
    typeof entry === "string" && entry.includes("brayer-opencode")
  );
}

async function healthCheck(url) {
  if (!url) return { name: "http health", ok: true, detail: "skipped (no --url)" };
  try {
    const res = await fetch(new URL("/health", url), { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return { name: "http health", ok: false, detail: `${url} -> ${res.status}` };
    const body = await res.json();
    return { name: "http health", ok: body?.ok === true, detail: `${url} -> ${JSON.stringify(body)}` };
  } catch (err) {
    return { name: "http health", ok: false, detail: `${url}: ${err?.message ?? err}` };
  }
}

export async function runDoctor({ rest = [], env = process.env, logger = console } = {}) {
  const harness = flagValue(rest, "--harness") ?? "opencode";
  const configPath = resolveConfigPath(flagValue(rest, "--config"), env);
  const checks = [];

  let config = null;
  try {
    config = parseJsonc(readFileSync(configPath, "utf8"));
    checks.push({ name: "identity config", ok: true, detail: configPath });
  } catch (err) {
    checks.push({ name: "identity config", ok: false, detail: `${configPath}: ${err?.message ?? err}` });
  }

  const url = flagValue(rest, "--url") ?? config?.mcp?.brayer?.url ?? "http://127.0.0.1:38293";

  if (config) {
    const mcp = config?.mcp?.brayer;
    checks.push({
      name: "brayer MCP",
      ok: Boolean(mcp && (mcp.url || mcp.command)),
      detail: mcp ? (mcp.url ?? mcp.command) : "missing mcp.brayer",
    });
    checks.push({
      name: "identity plugin",
      ok: pluginConfigured(config?.plugin),
      detail: pluginConfigured(config?.plugin)
        ? "brayer-opencode loaded"
        : "missing @igorjpimenta/brayer-opencode — bare MCP calls fail identity stamping",
    });
  }

  checks.push(await healthCheck(url));

  if (rest.includes("--json")) {
    console.log(JSON.stringify({ harness, config: configPath, checks }, null, 2));
  } else {
    for (const check of checks) logger.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name.padEnd(16)} ${check.detail}`);
  }
  const ok = checks.every((check) => check.ok);
  return { harness, config: configPath, checks, ok };
}
