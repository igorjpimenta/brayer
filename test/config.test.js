import test from "node:test";
import assert from "node:assert/strict";
import { resolveConfig, DEFAULTS } from "../src/config.js";

test("defaults apply when no explicit or env config exists", () => {
  const cfg = resolveConfig({ env: {} });
  assert.equal(cfg.leaseSeconds, DEFAULTS.leaseSeconds);
  assert.equal(cfg.maxAttempts, 3);
});

test("env overrides defaults and explicit overrides env", () => {
  const cfg = resolveConfig({
    env: { BRAYER_LEASE_SECONDS: "60", BRAYER_MAX_ATTEMPTS: "5" },
    explicit: { leaseSeconds: 90 },
  });
  assert.equal(cfg.leaseSeconds, 90);
  assert.equal(cfg.maxAttempts, 5);
});

test("integer knobs are parsed", () => {
  const cfg = resolveConfig({ env: { BRAYER_HTTP_PORT: "4000" } });
  assert.equal(cfg.httpPort, 4000);
});

test("malformed integer refuses", () => {
  assert.throws(() => resolveConfig({ env: { BRAYER_LEASE_SECONDS: "soon" } }), /non-negative integer/);
});

test("unknown explicit key refuses", () => {
  assert.throws(() => resolveConfig({ explicit: { leaseSecond: 1 } }), /unknown config key/);
});
