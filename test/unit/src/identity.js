import test from "node:test";
import assert from "node:assert/strict";
import { assertDeclaration, resolveIdentity, identityKey } from "../../../src/identity.js";

test("declaration is required", () => {
  assert.throws(() => assertDeclaration({}), /BRAYER_HARNESS is required/);
  assert.equal(assertDeclaration({ harness: "claude" }).harness, "claude");
});

test("meta stamp wins over args", () => {
  const id = resolveIdentity({
    meta: { brayer: { agent: "worker", session: "s1" } },
    args: { brayer_agent: "spoofed", brayer_session: "spoofed" },
    base: { harness: "claude" },
  });
  assert.deepEqual(id, { harness: "claude", agent: "worker", session: "s1" });
});

test("args are a fallback when meta is unreachable", () => {
  const id = resolveIdentity({
    args: { brayer_agent: "worker", brayer_session: "s1" },
    base: { harness: "codex" },
  });
  assert.equal(identityKey(id), "codex:worker:s1");
});

test("missing agent or session refuses", () => {
  assert.throws(() => resolveIdentity({ args: { brayer_session: "s1" }, base: { harness: "claude" } }), /agent must be stamped/);
  assert.throws(() => resolveIdentity({ args: { brayer_agent: "worker" }, base: { harness: "claude" } }), /session must be stamped/);
});

test("harness mismatch refuses", () => {
  assert.throws(() => resolveIdentity({
    meta: { brayer: { harness: "codex", agent: "a", session: "s" } },
    base: { harness: "claude" },
  }), /harness mismatch/);
});
